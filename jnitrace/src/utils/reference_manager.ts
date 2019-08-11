class ReferenceManager {
    private readonly references: { [id: string]: NativePointer };

    public constructor() {
        this.references = {};
    }

    public add(ref: NativePointer): void {
        this.references[ref.toString()] = ref;
    }

    public release(ref: NativePointer): void {
        if (this.references[ref.toString()] !== undefined) {
            delete this.references[ref.toString()];
        }
    }
};

export { ReferenceManager };
