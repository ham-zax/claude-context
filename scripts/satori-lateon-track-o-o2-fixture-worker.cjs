const process = require("node:process");

function compareContractStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function completeResults(message) {
    return message.identities.map((identity, index) => ({
        index,
        identity,
        relevanceScore: message.documents[index].length,
    })).sort((left, right) => (
        right.relevanceScore - left.relevanceScore
        || compareContractStrings(left.identity, right.identity)
    )).map(({ index, relevanceScore }) => ({ index, relevanceScore }));
}

process.on("message", (message) => {
    if (message.type === "initialize") {
        process.send({
            type: "ready",
            modelRevision: message.profile.identity.revision,
            profileDigest: message.profileDigest,
            projectionVersion: message.profile.identity.projectionVersion,
            candidateDepth: message.profile.inference.candidateDepth,
        });
        return;
    }
    if (message.query === "fixture:hang") return;
    if (message.query === "fixture:crash") process.exit(17);
    if (message.query === "fixture:malformed") {
        process.send({
            type: "result",
            requestId: message.requestId,
            results: [
                { index: 0, relevanceScore: 1 },
                { index: 0, relevanceScore: 2 },
            ],
        });
        return;
    }
    const respond = () => process.send({
        type: "result",
        requestId: message.requestId,
        results: completeResults(message),
    });
    if (message.query === "fixture:short") setTimeout(respond, 100);
    else if (message.query === "fixture:slow") setTimeout(respond, 400);
    else respond();
});
