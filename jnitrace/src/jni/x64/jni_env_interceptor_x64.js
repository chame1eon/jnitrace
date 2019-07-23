var JNIEnvInterceptor = require("../jni_env_interceptor");

function JNIEnvInterceptorX64(references, threads, transport) {
  this.references = references;
  this.threads = threads;
  this.transport = transport;

  this.grOffset = NULL;
  this.grOffsetStart = NULL;
  this.fpOffset = NULL;
  this.fpOffsetStart = NULL;
  this.overflowPtr = NULL;
  this.dataPtr = NULL;
}

JNIEnvInterceptorX64.prototype = new JNIEnvInterceptor();

JNIEnvInterceptor.prototype.buildVaArgParserShellcode =
  function(text, data, parser) {
    Memory.patchCode(text, Process.pageSize, function (code) {
      var cw = new X86Writer(code, { pc: text });
      var dataOffset = 0;
      var xmmOffset = 0;
      var regs = [
                  "rdi", "rsi", "rdx", "rcx", "r8", "r9", "rax",
                  "rbx", "r10", "r11", "r12", "r13", "r14", "r15",
                  "xmm0", "xmm1", "xmm2", "xmm3", "xmm4", "xmm5",
                  "xmm6", "xmm7"
                 ];

      for (var i = 0; i < regs.length; i++) {
        cw.putMovNearPtrReg(data.add(dataOffset), "rdi");
        dataOffset += Process.pointerSize;

        if (i < regs.length - 1) {
          if (regs[i + 1].indexOf("xmm") > -1) {
            cw.putU8(0x66);
            cw.putU8(0x48);
            cw.putU8(0x0f);
            cw.putU8(0x7e);
            cw.putU8(0xc7 + xmmOffset * 8);
            xmmOffset++;
          } else {
            cw.putMovRegReg("rdi", regs[i + 1]);
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

      var regRestoreOffset = dataOffset - Process.pointerSize * 2;
      for (var i = regs.length - 1; i >= 0; i--) {
        var regRestoreOffset = i * Process.pointerSize;

        cw.putMovRegNearPtr("rdi", data.add(regRestoreOffset));

        if (i > 0) {
          if (regs[i].indexOf("xmm") > -1) {
            cw.putU8(0x66);
            cw.putU8(0x48);
            cw.putU8(0x0f);
            cw.putU8(0x6e);
            cw.putU8(0xc7 + xmmOffset * 8);
            xmmOffset--;
          } else {
            cw.putMovRegReg(regs[i], "rdi");
          }
        }
      }

      cw.putMovNearPtrReg(data.add(dataOffset), "rdi");
      var rdiBackup = dataOffset;
      dataOffset += Process.pointerSize;

      var cbAddressOffset = rdiBackup - Process.pointerSize;
      cw.putMovRegNearPtr("rdi", data.add(cbAddressOffset));

      cw.putMovNearPtrReg(data.add(dataOffset), "r13");
      var r13Backup = dataOffset;
      cw.putMovRegReg("r13", "rdi");

      cw.putMovRegNearPtr("rdi", data.add(rdiBackup));
      cw.putCallReg("r13");
      cw.putMovRegNearPtr("r13", data.add(r13Backup));

      var retAddressOffset = cbAddressOffset - Process.pointerSize;
      cw.putJmpNearPtr(data.add(retAddressOffset));

      cw.flush();
    });
  }

JNIEnvInterceptorX64.prototype.setUpVaListArgExtract = function(vaList) {
  this.grOffset = Memory.readU32(vaList);
  this.grOffsetStart = this.grOffset;
  this.fpOffset = Memory.readU32(vaList.add(4));
  this.fpOffsetStart = this.fpOffset;
  this.overflowPtr = Memory.readPointer(vaList.add(Process.pointerSize));
  this.dataPtr = Memory.readPointer(vaList.add(Process.pointerSize * 2));
}

JNIEnvInterceptorX64.prototype.extractVaListArgValue =
  function(method, paramId) {
    var currentPtr = NULL;

    if (method.params[paramId] === "float" ||
        method.params[paramId] === "double") {
      if ((this.fpOffset - this.fpOffsetStart) / Process.pointerSize < 14) {
        currentPtr = this.dataPtr.add(this.fpOffset);

        this.fpOffset += Process.pointerSize * 2;
      } else {
        var reverseId = method.params.length - paramId - 1;
        currentPtr = this.overflowPtr.add(reverseId * Process.pointerSize);
      }
    } else {
      if ((this.grOffset - this.grOffsetStart) / Process.pointerSize < 2) {
        currentPtr = this.dataPtr.add(this.grOffset);

        this.grOffset += Process.pointerSize;
      } else {
        var reverseId = method.params.length - paramId - 1;
        currentPtr = this.overflowPtr.add(reverseId * Process.pointerSize);
      }
    }

    return currentPtr;
  }

JNIEnvInterceptorX64.prototype.resetVaListArgExtract = function() {
  this.grOffset = NULL;
  this.grOffsetStart = NULL;
  this.fpOffset = NULL;
  this.fpOffsetStart = NULL;
  this.overflowPtr = NULL;
  this.dataPtr = NULL;
}

module.exports = JNIEnvInterceptorX64;
