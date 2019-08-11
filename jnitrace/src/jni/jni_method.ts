class JNIMethod {
    public readonly name: string;
    public readonly args: string[];
    public readonly ret: string;

    private constructor(name: string, args: string[], ret: string) {
        this.name = name;
        this.args = args;
        this.ret = ret;
    }
}

export { JNIMethod };