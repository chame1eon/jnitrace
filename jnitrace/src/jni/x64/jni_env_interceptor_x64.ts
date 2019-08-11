import { JNIEnvInterceptor } from "../jni_env_interceptor";
import { JNIThreadManager } from "../jni_thread_manager";

import { DataTransport } from "../../transport/data_transport";

import { ReferenceManager } from "../../utils/reference_manager";
import { JavaMethod } from "../../utils/java_method";

class JNIEnvInterceptorX64 extends JNIEnvInterceptor {
    private grOffset: number;
    private grOffsetStart: number;
    private fpOffset: number;
    private fpOffsetStart: number;
    private overflowPtr: NativePointer;
    private dataPtr: NativePointer;

    public constructor(
        references: ReferenceManager,
        threads: JNIThreadManager,
        transport: DataTransport
    ) {
        super(references, threads, transport);

        this.grOffset = 0;
        this.grOffsetStart = 0;
        this.fpOffset = 0;
        this.fpOffsetStart = 0;
        this.overflowPtr = NULL;
        this.dataPtr = NULL;
    }

    protected buildVaArgParserShellcode(
        text: NativePointer,
        data: NativePointer,
        parser: NativeCallback
    ): void {
        Memory.patchCode(text, Process.pageSize, (code): void => {
            const cw = new X86Writer(code, { pc: text });
            const XMM_INC_VALUE = 8;
            const SKIP_FIRST_REG = 1;

            const XMM_MOV_INS_1 = 0x66;
            const XMM_MOV_INS_2 = 0x48;
            const XMM_MOV_INS_3 = 0x0f;
            const XMM_MOV_TO_INS_4 = 0x7e;
            const XMM_MOV_INS_5 = 0xc7;

            const regs = [
                "rdi", "rsi", "rdx", "rcx", "r8", "r9", "rax",
                "rbx", "r10", "r11", "r12", "r13", "r14", "r15",
                "xmm0", "xmm1", "xmm2", "xmm3", "xmm4", "xmm5",
                "xmm6", "xmm7"
            ];
            let dataOffset = 0;
            let xmmOffset = 0;

            for (let i = 0; i < regs.length; i++) {
                cw.putMovNearPtrReg(data.add(dataOffset), "rdi");
                dataOffset += Process.pointerSize;

                if (i < regs.length - SKIP_FIRST_REG) {
                    if (regs[i + SKIP_FIRST_REG].includes("xmm")) {
                        cw.putU8(XMM_MOV_INS_1);
                        cw.putU8(XMM_MOV_INS_2);
                        cw.putU8(XMM_MOV_INS_3);
                        cw.putU8(XMM_MOV_TO_INS_4);
                        cw.putU8(XMM_MOV_INS_5 + xmmOffset * XMM_INC_VALUE);
                        xmmOffset++;
                    } else {
                        cw.putMovRegReg(
                            "rdi", regs[i + SKIP_FIRST_REG] as X86Register
                        );
                    }
                }
            }

            xmmOffset--;

            cw.putPopReg("rdi");
            cw.putMovNearPtrReg(data.add(dataOffset), "rdi");
            dataOffset += Process.pointerSize;

            cw.putCallAddress(parser);

            cw.putMovNearPtrReg(data.add(dataOffset), "rax");
            dataOffset += Process.pointerSize;

            const REG_SIZE = 2;
            const END_INDEX = 1;
            const SKIP_FIRST_COPY = 0;
            const FIRST_ELEM_INDEX = 0;

            const XMM_MOV_FROM_INS_4 = 0x6e;

            let regRestoreOffset = dataOffset - Process.pointerSize * REG_SIZE;

            for (let i = regs.length - END_INDEX; i >= FIRST_ELEM_INDEX; i--) {
                regRestoreOffset = i * Process.pointerSize;

                cw.putMovRegNearPtr("rdi", data.add(regRestoreOffset));

                if (i > SKIP_FIRST_COPY) {
                    if (regs[i].includes("xmm")) {
                        cw.putU8(XMM_MOV_INS_1);
                        cw.putU8(XMM_MOV_INS_2);
                        cw.putU8(XMM_MOV_INS_3);
                        cw.putU8(XMM_MOV_FROM_INS_4);
                        cw.putU8(XMM_MOV_INS_5 + xmmOffset * XMM_INC_VALUE);
                        xmmOffset--;
                    } else {
                        cw.putMovRegReg(regs[i] as X86Register, "rdi");
                    }
                }
            }

            cw.putMovNearPtrReg(data.add(dataOffset), "rdi");
            const rdiBackup = dataOffset;
            dataOffset += Process.pointerSize;

            const cbAddressOffset = rdiBackup - Process.pointerSize;
            cw.putMovRegNearPtr("rdi", data.add(cbAddressOffset));

            cw.putMovNearPtrReg(data.add(dataOffset), "r13");
            const r13Backup = dataOffset;
            cw.putMovRegReg("r13", "rdi");

            cw.putMovRegNearPtr("rdi", data.add(rdiBackup));
            cw.putCallReg("r13");
            cw.putMovRegNearPtr("r13", data.add(r13Backup));

            const retAddressOffset = cbAddressOffset - Process.pointerSize;
            cw.putJmpNearPtr(data.add(retAddressOffset));

            cw.flush();
        });
    }

    protected setUpVaListArgExtract(vaList: NativePointer): void {
        const FP_OFFSET = 4;
        const DATA_OFFSET = 2;

        this.grOffset = vaList.readU32();
        this.grOffsetStart = this.grOffset;
        this.fpOffset = vaList.add(FP_OFFSET).readU32();
        this.fpOffsetStart = this.fpOffset;
        this.overflowPtr = vaList.add(Process.pointerSize).readPointer();
        this.dataPtr = vaList.add(Process.pointerSize * DATA_OFFSET)
            .readPointer();
    }

    protected extractVaListArgValue(
        method: JavaMethod,
        paramId: number
    ): NativePointer {
        const FP_REG_SIZE = 2;
        const MAX_GR_REG_NUM = 2;
        const MAX_FP_REG_NUM = 14;
        const OFFSET = 1;

        let currentPtr = NULL;

        if (method.fridaParams[paramId] === "float" ||
                method.fridaParams[paramId] === "double") {
            const fpDelta = this.fpOffset - this.fpOffsetStart;
            if (fpDelta / Process.pointerSize < MAX_FP_REG_NUM) {
                currentPtr = this.dataPtr.add(this.fpOffset);

                this.fpOffset += Process.pointerSize * FP_REG_SIZE;
            } else {
                const reverseId = method.fridaParams.length - paramId - OFFSET;
                currentPtr = this.overflowPtr.add(
                    reverseId * Process.pointerSize
                );
            }
        } else {
            const grDelta = this.grOffset - this.grOffsetStart;
            if (grDelta / Process.pointerSize < MAX_GR_REG_NUM) {
                currentPtr = this.dataPtr.add(this.grOffset);

                this.grOffset += Process.pointerSize;
            } else {
                const reverseId = method.fridaParams.length - paramId - OFFSET;
                currentPtr = this.overflowPtr.add(
                    reverseId * Process.pointerSize
                );
            }
        }

        return currentPtr;
    }

    protected resetVaListArgExtract(): void {
        this.grOffset = 0;
        this.grOffsetStart = 0;
        this.fpOffset = 0;
        this.fpOffsetStart = 0;
        this.overflowPtr = NULL;
        this.dataPtr = NULL;
    }
};

export { JNIEnvInterceptorX64 };
