#!/usr/bin/env python3
"""Create checksumable PyLate reference evidence for LateOn C0."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
from typing import Any

import numpy as np
from pylate import models, rank


REFERENCE_QUERY = (
    "Which function computes the final candidate score used for search ordering?"
)
REFERENCE_DOCUMENTS = [
    (
        "score-owner",
        "export function computeSearchCandidateFinalScore(candidate) { "
        "return candidate.fusionScore + candidate.entrypointOwnerScoreBoost; }",
    ),
    (
        "path-policy",
        "Path policy classifies tests, scripts, adapters, and core files before "
        "ranking candidates.",
    ),
    (
        "diagnostic-output",
        "This module formats diagnostic output and writes a report to disk.",
    ),
]


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--cache-directory", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--local-files-only", action="store_true")
    return parser.parse_args()


def token_record(model: models.ColBERT, text: str, *, is_query: bool) -> dict[str, Any]:
    tokenized = model.tokenize([text], is_query=is_query)
    return {
        "inputIds": tokenized["input_ids"][0].tolist(),
        "attentionMask": tokenized["attention_mask"][0].tolist(),
    }


def to_float_lists(embeddings: list[np.ndarray]) -> list[list[list[float]]]:
    return [embedding.astype(np.float64).tolist() for embedding in embeddings]


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def main() -> None:
    arguments = parse_arguments()
    model = models.ColBERT(
        arguments.model,
        revision=arguments.revision,
        cache_folder=arguments.cache_directory,
        local_files_only=arguments.local_files_only,
        device="cpu",
    )
    document_texts = [text for _, text in REFERENCE_DOCUMENTS]
    query_embeddings = model.encode(
        [REFERENCE_QUERY],
        is_query=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    document_embeddings = model.encode(
        document_texts,
        is_query=False,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    document_ids = [document_id for document_id, _ in REFERENCE_DOCUMENTS]
    reranked = rank.rerank(
        [document_ids],
        query_embeddings,
        [document_embeddings],
    )[0]

    evidence = {
        "schemaVersion": "satori_lateon_c0_reference_v1",
        "runtime": {
            "pylate": importlib.metadata.version("pylate"),
            "torch": importlib.metadata.version("torch"),
            "transformers": importlib.metadata.version("transformers"),
        },
        "checkpoint": {
            "repository": arguments.model,
            "revision": arguments.revision,
        },
        "fixture": {
            "query": {
                "text": REFERENCE_QUERY,
                **token_record(model, REFERENCE_QUERY, is_query=True),
            },
            "documents": [
                {
                    "id": document_id,
                    "text": text,
                    **token_record(model, text, is_query=False),
                }
                for document_id, text in REFERENCE_DOCUMENTS
            ],
        },
        "embeddings": {
            "query": to_float_lists(query_embeddings),
            "documents": to_float_lists(document_embeddings),
        },
        "scores": [
            {"id": result["id"], "score": float(result["score"])}
            for result in reranked
        ],
    }
    output_path = Path(arguments.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = canonical_bytes(evidence)
    output_path.write_bytes(serialized + b"\n")
    print(
        json.dumps(
            {
                "output": str(output_path),
                "sha256": hashlib.sha256(serialized + b"\n").hexdigest(),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
