var JNIEnvInterceptor = require("../jni_env_interceptor");
var Types = require("../../utils/types");

function JNIEnvInterceptorARM64(references, threads, transport) {
  this.references = references;
  this.threads = threads;
  this.transport = transport;

  this.vaList = NULL;
  this.vaListOffset = 0;
}

JNIEnvInterceptorARM64.prototype = new JNIEnvInterceptor();

JNIEnvInterceptorARM64.prototype.createStubFunction = function() {
  var stub = Memory.alloc(Process.pageSize);

  Memory.patchCode(stub, Process.pageSize, function(code) {
    var cw = new Arm64Writer(code, { pc: stub });

    cw.putInstruction(0xd65f03c0);

  });

  return stub;
}

JNIEnvInterceptorARM64.prototype.buildVaArgParserShellcode =
  function(text, data, parser) {
    //text = Memory.alloc(Process.pageSize);
    Memory.writePointer(text.add(0x400), parser);

    Memory.patchCode(text, Process.pageSize, function(code) {
      var cw = new Arm64Writer(code, { pc: text });

      // adrp x0, #0
      cw.putInstruction(0x90000000);

      // back up all registers - just to be safe
      for (var i = 1; i < 31; i++) {
        var ins = 0xF9000000;

        // src reg
        ins += i;

        var offset = 0x408 + (i * Process.pointerSize);

        // dst address
        ins += (offset / 2) << 8;

        // str x<n>, [x0, #<offset>]
        cw.putInstruction(ins);
      }

      // ldr x0, [x0, #0x400]
      cw.putInstruction(0xF9420000);
      // blr x0
      cw.putInstruction(0xD63F0000);

      cw.putPushRegReg("x0", "sp");

      // adrp x0, #0
      cw.putInstruction(0x90000000);

      // restore all registers - apart from lr and sp
      for (var i = 1; i < 30; i++) {
        var ins = 0xF9400000;

        // src reg
        ins += i;

        var offset = 0x408 + (i * Process.pointerSize);

        // dst address
        ins += (offset / 2) << 8;

        // ldr x<n>, [x0, #<offset>]
        cw.putInstruction(ins);
      }

      cw.putPopRegReg("x0", "sp");

      // blr x0
      cw.putInstruction(0xD63F0000);

      // adrp x1, #0
      cw.putInstruction(0x90000001);
      // ldr x2, [x1, #0x4f8]
      cw.putInstruction(0xF9427C22);

      // br x2
      cw.putInstruction(0xD61F0040);

      cw.flush();
    });

    // required to prevent a crash
    Interceptor.attach(text, function() {});
  }

JNIEnvInterceptorARM64.prototype.setUpVaListArgExtract = function(vaList) {
  this.stack = Memory.readPointer(vaList);
  this.stackIndex = 0;
  this.grTop = Memory.readPointer(vaList.add(Process.pointerSize));
  this.vrTop = Memory.readPointer(vaList.add(Process.pointerSize * 2));
  this.grOffs = Memory.readS32(vaList.add(Process.pointerSize * 3));
  this.grOffsIndex = 0;
  this.vrOffs = Memory.readS32(vaList.add(Process.pointerSize * 3 + 4));
  this.vrOffsIndex = 0;
}

JNIEnvInterceptorARM64.prototype.extractVaListArgValue =
  function(method, paramId) {
    var currentPtr = NULL;

    if (method.params[paramId] === "float" ||
        method.params[paramId] === "double") {
      if (this.vrOffsIndex < 8) {
        currentPtr = this.vrTop
                            .add(this.vrOffs)
                            .add(this.vrOffsIndex * Process.pointerSize * 2);

        this.vrOffsIndex++;
      } else {
        currentPtr = this.stack.add(this.stackIndex * Process.pointerSize);
        this.stackIndex++;
      }
    } else {
      if (this.grOffsIndex < 4) {
        currentPtr = this.grTop
                            .add(this.grOffs)
                            .add(this.grOffsIndex * Process.pointerSize);

        this.grOffsIndex++;
      } else {
        currentPtr = this.stack.add(this.stackIndex * Process.pointerSize);
        this.stackIndex++;
      }
    }

    return currentPtr;
  }

JNIEnvInterceptorARM64.prototype.resetVaListArgExtract = function() {
  this.stack = NULL;
  this.stackIndex = 0;
  this.grTop = NULL;
  this.vrTop = NULL;
  this.grOffs = NULL;
  this.grOffsIndex = 0;
  this.vrOffs = NULL;
  this.vrOffsIndex = 0;
}

JNIEnvInterceptorARM64.prototype.processVaListRetVal =
  function(retType, retval, registers) {
    return retval;
  }

module.exports = JNIEnvInterceptorARM64;
