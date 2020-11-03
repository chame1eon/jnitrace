import { Types } from "./types";

const SEMI_COLON_OFFSET = 1;

class JavaMethod {
    private readonly __: string;

    private readonly _params: string[];

    private readonly _ret: string;

    public constructor (signature: string) {
        const primitiveTypes = ["B", "S", "I", "J", "F", "D", "C", "Z", "V"];
        let isArray = false;
        let isRet = false;

        const jParamTypes: string[] = [];
        let jRetType = "unknown";

        for (var i = 0; i < signature.length; i++) {
            if (signature.charAt(i) === "(") {
                continue;
            }

            if (signature.charAt(i) === ")") {
                isRet = true;
                continue;
            }

            if (signature.charAt(i) === "[") {
                isArray = true;
                continue;
            }

            let jtype = "unknown";

            if (primitiveTypes.includes(signature.charAt(i))) {
                jtype = signature.charAt(i);
            } else if (signature.charAt(i) === "L") {
                var end = signature.indexOf(";", i) + SEMI_COLON_OFFSET;
                jtype = signature.substring(i, end);
                i = end - SEMI_COLON_OFFSET;
            }

            // ?
            if (isArray) {
                jtype = "[" + jtype;
            }

            if (!isRet) {
                jParamTypes.push(jtype);
            } else {
                jRetType = jtype;
            }

            isArray = false;
        }

        this.__ = signature;
        this._params = jParamTypes;
        this._ret = jRetType;
    }

    public get params (): string[] {
        return this._params;
    }

    public get nativeParams (): string[] {
        const nativeParams: string[] = [];
        this._params.forEach((p: string): void => {
            const nativeJType = Types.convertJTypeToNativeJType(p);

            nativeParams.push(nativeJType);
        });
        return nativeParams;
    }

    public get fridaParams (): string[] {
        const fridaParams: string[] = [];
        this._params.forEach((p: string): void => {
            const nativeJType = Types.convertJTypeToNativeJType(p);
            const fridaType = Types.convertNativeJTypeToFridaType(nativeJType);

            fridaParams.push(fridaType);
        });
        return fridaParams;
    }

    public get ret (): string {
        return this._ret;
    }

    public get fridaRet (): string {
        const jTypeRet = Types.convertJTypeToNativeJType(this._ret);
        return Types.convertNativeJTypeToFridaType(jTypeRet);
    }
}

export { JavaMethod };
