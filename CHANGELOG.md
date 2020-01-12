# jnitrace Change Log

## 3.0.2
- Updated version of jnitrace-engine to get new bug fixes

## 3.0.1
- Updated version of jnitrace-engine to get new bug fixes

## 3.0.0
- Extracted the engine in jnitrace to a new project so that the API can be used by developers

## 2.2.3
- Improved the backtrace output when no DebugSymbol is found for an address.

## 2.2.2
- Bug fix to handle when a DebugSymbol look up has failed for an address.

## 2.2.1
- Sorted the alignment of the backtraces so they are right justified
- Fixed a bug when tracing Release<ArrayType>Elements where all types were assumed to be the size of a pointer
- Upgraded eslint-package to patch security vulnerability
- Stopped trying to kill Frida session if it was already dead

## 2.2.0
- Changed backtrace output to include debug symbols, where possible

## 2.1.0
- Added two new command line arguments to filter the library exports from the trace
- Changed the way object data was associated with output to ensure it is still visible if the method is not being traced

## 2.0.1
- Fix a bug preventing frida attach from working
- Updated README

## 2.0.0
- General code refactoring, including upgrading codebase to TypeScript
- Added tracing of the JavaVM struct by default
- Added method filters to include or exclude certain methods from the trace
- Added options to allow custom Frida scripts to be loaded before and after jnitrace is loaded
- Added option to export all traced data to a json formatted file
- Added options to switch off tracking of the whole JavaVM or JNIEnv
- Application is now killed when the tracer is finished to prevent crashes
- Log messages have been added to show when a tracked library is loaded
- Added support to capture floating point return values on X86 devices
- jnitrace now also displays the values of jvalue* and va_list for method calls
- Bugfix for crashes on arm 32 bit devices


## 1.3.5
- Bug fix - Backtraces are now printed correctly for variadic functions
- jboolean values now print true/false as well as the integer value
- Updated README

## 1.3.4
- Bug fix - Used Interceptor.replace to ensure that the CpuContext is populated for use by the Backtracer
- Bug fix - Updated the JNI function definitions to set the return type of Get<Type>ArrayElements to be a pointer rather than a primitive

## 1.3.3
- Bug fix - Checked whether the this context exists before using it

## 1.3.2
- Bug fix - Use Process.findRangeByAddress instead of Process.findModuleByAddress for checking the validity of the stack pointer

## 1.3.1
- Travis integration

## 1.3.0
- Added a command argument to get the version of jnitrace
- jnitrace now intercepts calls to GetJavaVM, returning a shadowJavaVM
- Added support for extracting arguments stored in jvalue arrays

## 1.2.1
- Bug fix - CallStaticObjectMethod was the only va args method intercepted

## 1.2.0
- Added arm64 architecture support
- Modified how dlopen is intercepted to support Android 7 and above
