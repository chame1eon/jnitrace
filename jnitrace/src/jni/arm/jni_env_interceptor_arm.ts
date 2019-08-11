import { JNIEnvInterceptor } from "../jni_env_interceptor";
import { JNIThreadManager } from "../jni_thread_manager";

import { DataTransport } from "../../transport/data_transport";

import { Types } from "../../utils/types";
import { ReferenceManager } from "../../utils/reference_manager";
import { JavaMethod } from "../../utils/java_method";

class JNIEnvInterceptorARM extends JNIEnvInterceptor {
    private vaList: NativePointer;
    private vaListOffset: number;

    public constructor(
        references: ReferenceManager,
        threads: JNIThreadManager,
        transport: DataTransport
    ) {
        super(references, threads, transport);

        this.vaList = NULL;
        this.vaListOffset = 0;
    }

    public createStubFunction(): NativeCallback {
        const stub = Memory.alloc(Process.pageSize);

        Memory.patchCode(stub, Process.pageSize, (code): void => {
            const cw = new ArmWriter(code, { pc: stub });

            // push { lr }
            const PUSH_LR = 0xe52de004;
            cw.putInstruction(PUSH_LR);
            // pop { pc }
            const POP_PC = 0xe49df004;
            cw.putInstruction(POP_PC);

        });

        return stub;
    }

    protected buildVaArgParserShellcode(
        text: NativePointer,
        data: NativePointer,
        parser: NativeCallback
    ): void {
        const DATA_OFFSET = 0x400;
        text.add(DATA_OFFSET).writePointer(parser);

        Memory.patchCode(text, Process.pageSize, (code): void => {
            const cw = new ArmWriter(code, { pc: text });

            // nops for the context interceptor to overwrite
            cw.putNop();
            cw.putNop();
            cw.putNop();
            cw.putNop();

            // str r0, [pc, #0x400]
            const STR_R0_400 = 0xe58f0400;
            cw.putInstruction(STR_R0_400);
            // str r1, [pc, #0x400]
            const STR_R1_400 = 0xe58f1400;
            cw.putInstruction(STR_R1_400);
            // str r2, [pc, #0x400]
            const STR_R2_400 = 0xe58f2400;
            cw.putInstruction(STR_R2_400);
            // str r3, [pc, #0x400]
            const STR_R3_400 = 0xe58f3400;
            cw.putInstruction(STR_R3_400);
            // str lr, [pc, #0x400]
            const STR_LR_400 = 0xe58fe400;
            cw.putInstruction(STR_LR_400);

            // ldr r0, [pc, #0x3e4]
            const LDR_R0_3E4 = 0xe59f03d4;
            cw.putInstruction(LDR_R0_3E4);
            // blx r0
            const BLX_R0 = 0xe12fff30;
            cw.putInstruction(BLX_R0);

            // ldr r1, [pc, 0x3e0]
            const LDR_R1_3E0 = 0xe59f13e8;
            cw.putInstruction(LDR_R1_3E0);
            // ldr r2, [pc, 0x3e0]
            const LDR_R2_3E0 = 0xe59f23e8;
            cw.putInstruction(LDR_R2_3E0);
            // ldr r3, [pc, 0x3e0]
            const LDR_R3_3E0 = 0xe59f33e8;
            cw.putInstruction(LDR_R3_3E0);

            //blx r0
            cw.putInstruction(BLX_R0);

            // ldr r1, [pc, #0x3e4]
            const LDR_R1_3E4 = 0xe59f13e4;
            cw.putInstruction(LDR_R1_3E4);

            // bx r1
            const BX_R1 = 0xe12fff11;
            cw.putInstruction(BX_R1);

            cw.flush();
        });
    }

    protected setUpVaListArgExtract(vaList: NativePointer): void {
        this.vaList = vaList;
        this.vaListOffset = 0;
    }

    protected extractVaListArgValue(
        method: JavaMethod,
        paramId: number
    ): NativePointer {
        const currentPtr = this.vaList.add(this.vaListOffset);
        this.vaListOffset += Types.sizeOf(method.fridaParams[paramId]);
        return currentPtr;
    }

    protected resetVaListArgExtract(): void {
        this.vaList = NULL;
        this.vaListOffset = 0;
    }
}

export { JNIEnvInterceptorARM };
