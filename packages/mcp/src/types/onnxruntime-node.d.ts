declare module "onnxruntime-node" {
    export class Tensor {
        constructor(
            type: "int64",
            data: BigInt64Array,
            dims: readonly number[],
        );
        readonly type: string;
        readonly data:
            | Float32Array
            | Float64Array
            | BigInt64Array
            | BigUint64Array
            | Int8Array
            | Uint8Array
            | Int16Array
            | Uint16Array
            | Int32Array
            | Uint32Array;
        readonly dims: readonly number[];
    }

    export class InferenceSession {
        static create(
            modelPath: string,
            options: {
                executionProviders: readonly string[];
                intraOpNumThreads: number;
                interOpNumThreads: number;
            },
        ): Promise<InferenceSession>;
        run(feeds: Readonly<Record<string, Tensor>>): Promise<Record<string, Tensor>>;
        release(): Promise<void>;
    }
}
