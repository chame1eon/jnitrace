class JNIThreadManager {
    private shadowJavaVM: NativePointer;
    private readonly threads: { [id: number]: NativePointer };

    public constructor() {
        this.threads = {};
        this.shadowJavaVM = NULL;
    }
    
    public getJavaVM(): NativePointer {
        return this.shadowJavaVM;
    }

    public hasJavaVM(): boolean {
        return !this.shadowJavaVM.isNull();
    }

    public setJavaVM(javaVM: NativePointer): void {
        this.shadowJavaVM = javaVM;
    }

    public getJNIEnv(threadId: number): NativePointer {
        if (this.threads[threadId] !== undefined) {
            return this.threads[threadId];
        } else {
            return NULL;
        }
    }

    public hasJNIEnv(threadId: number): boolean {
        return !this.getJNIEnv(threadId).isNull();
    }

    public setJNIEnv(threadId: number, jniEnv: NativePointer): void {
        this.createEntry(threadId, jniEnv);
    }

    public needsJNIEnvUpdate(threadId: number, jniEnv: NativePointer): boolean {
        const entry = this.getEntry(threadId);
        if (entry === undefined || !entry.equals(jniEnv)) {
            return true;
        }
        return false;
    }

    private createEntry(threadId: number, jniEnv: NativePointer): void {
        this.threads[threadId] = jniEnv;
    }

    private getEntry(threadId: number): NativePointer {
        return this.threads[threadId];
    }
};

export { JNIThreadManager };
