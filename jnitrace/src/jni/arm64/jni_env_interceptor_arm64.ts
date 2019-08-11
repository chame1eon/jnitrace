import { JNIEnvInterceptor } from "../jni_env_interceptor";
import { JNIThreadManager } from "../jni_thread_manager";

import { DataTransport } from "../../transport/data_transport";

import { ReferenceManager } from "../../utils/reference_manager";
import { JavaMethod } from "../../utils/java_method";

class JNIEnvInterceptorARM64 extends JNIEnvInterceptor {
    private stack: NativePointer;
    private stackIndex: number;
    private grTop: NativePointer;
    private vrTop: NativePointer;
    private grOffs: number;
    private grOffsIndex: number;
    private vrOffs: number;
    private vrOffsIndex: number;

    public constructor(
        references: ReferenceManager,
        threads: JNIThreadManager,
        transport: DataTransport
    ) {
        super(references, threads, transport);

        this.stack = NULL;
        this.stackIndex = 0;
        this.grTop = NULL;
        this.vrTop = NULL;
        this.grOffs = 0;
        this.grOffsIndex = 0;
        this.vrOffs = 0;
        this.vrOffsIndex = 0;
    }

    public createStubFunction(): NativePointer {
        const stub = Memory.alloc(Process.pageSize);

        Memory.patchCode(stub, Process.pageSize, (code): void => {
            const cw = new Arm64Writer(code, { pc: stub });

            // ret
            const RET = 0xd65f03c0;
            cw.putInstruction(RET);

        });

        return stub;
    }

    protected buildVaArgParserShellcode(
        text: NativePointer,
        data: NativePointer,
        parser: NativeCallback
    ): void {
        const DATA_OFFSET = 0x400;
        const BITS_IN_BYTE = 8;
        const HALF = 2;
        const NUM_REGS = 31;
        const NUM_REG_NO_LR = 30;
        text.add(DATA_OFFSET).writePointer(parser);

        Memory.patchCode(text, Process.pageSize, (code): void => {
            const cw = new Arm64Writer(code, { pc: text });

            // adrp x0, #0
            const ADRP_X0_0 = 0x90000000;
            cw.putInstruction(ADRP_X0_0);

            // back up all registers - just to be safe
            for (let i = 1; i < NUM_REGS; i++) {
                let ins = 0xF9000000;

                // src reg
                ins += i;

                const base = 0x408;
                const offset = base + i * Process.pointerSize;

                // dst address
                ins += offset / HALF << BITS_IN_BYTE;

                // str x<n>, [x0, #<offset>]
                cw.putInstruction(ins);
            }

            // ldr x0, [x0, #0x400]
            const LDR_X0_X0_400 = 0xF9420000;
            cw.putInstruction(LDR_X0_X0_400);
            // blr x0
            const BLR_X0 = 0xD63F0000;
            cw.putInstruction(BLR_X0);

            cw.putPushRegReg("x0", "sp");

            // adrp x0, #0
            cw.putInstruction(ADRP_X0_0);

            // restore all registers - apart from lr and sp
            for (let i = 1; i < NUM_REG_NO_LR; i++) {
                let ins = 0xF9400000;

                // src reg
                ins += i;

                const base = 0x408;
                const offset = base + i * Process.pointerSize;

                // dst address
                ins += offset / HALF << BITS_IN_BYTE;

                // ldr x<n>, [x0, #<offset>]
                cw.putInstruction(ins);
            }

            cw.putPopRegReg("x0", "sp");

            // blr x0
            cw.putInstruction(BLR_X0);

            // adrp x1, #0
            const ADRP_X1_0 = 0x90000001;
            cw.putInstruction(ADRP_X1_0);
            // ldr x2, [x1, #0x4f8]
            const LDR_X2_X1_4F8 = 0xF9427C22;
            cw.putInstruction(LDR_X2_X1_4F8);

            // br x2
            const BR_X2 = 0xD61F0040;
            cw.putInstruction(BR_X2);

            cw.flush();
        });
    }

    protected setUpVaListArgExtract(vaList: NativePointer): void {
        const vrStart = 2;
        const grOffset = 3;
        const vrOffset = 4;
        this.stack = vaList.readPointer();
        this.stackIndex = 0;
        this.grTop = vaList.add(Process.pointerSize).readPointer();
        this.vrTop = vaList.add(Process.pointerSize * vrStart).readPointer();
        this.grOffs = vaList.add(Process.pointerSize * grOffset).readS32();
        this.grOffsIndex = 0;
        this.vrOffs = vaList.add(
            Process.pointerSize * grOffset + vrOffset
        ).readS32();
        this.vrOffsIndex = 0;
    }

    protected extractVaListArgValue(
        method: JavaMethod,
        paramId: number
    ): NativePointer {
        const MAX_VR_REG_NUM = 8;
        const VR_REG_SIZE = 2;
        const MAX_GR_REG_NUM = 4;
        let currentPtr = NULL;

        if (method.fridaParams[paramId] === "float" ||
          method.fridaParams[paramId] === "double") {
            if (this.vrOffsIndex < MAX_VR_REG_NUM) {
                currentPtr = this.vrTop
                    .add(this.vrOffs)
                    .add(this.vrOffsIndex * Process.pointerSize * VR_REG_SIZE);

                this.vrOffsIndex++;
            } else {
                currentPtr = this.stack.add(
                    this.stackIndex * Process.pointerSize
                );
                this.stackIndex++;
            }
        } else {
            if (this.grOffsIndex < MAX_GR_REG_NUM) {
                currentPtr = this.grTop
                    .add(this.grOffs)
                    .add(this.grOffsIndex * Process.pointerSize);

                this.grOffsIndex++;
            } else {
                currentPtr = this.stack.add(
                    this.stackIndex * Process.pointerSize
                );
                this.stackIndex++;
            }
        }

        return currentPtr;
    }

    protected resetVaListArgExtract(): void {
        this.stack = NULL;
        this.stackIndex = 0;
        this.grTop = NULL;
        this.vrTop = NULL;
        this.grOffs = 0;
        this.grOffsIndex = 0;
        this.vrOffs = 0;
        this.vrOffsIndex = 0;
    }
};

export { JNIEnvInterceptorARM64 };
