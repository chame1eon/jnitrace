"""
Main JNITrace python script to inject the JNITracing javascript into a target
process.
"""

import argparse
import binascii
import json

import frida
import hexdump

from pkg_resources import resource_string
from pkg_resources import require

from colorama import Fore, Style, init


__version__ = require("jnitrace")[0].version

init()

PALETTE = [
    Fore.CYAN,
    Fore.MAGENTA,
    Fore.YELLOW,
    Fore.GREEN,
    Fore.RED,
    Fore.BLUE
]

class ColorManager:
    """
    ColorManager manages the current output color used by the formatter.
    It also stores the thread to color assignments.
    """
    def __init__(self):
        self._current_color = None
        self._next_color = 0
        self._thread_colors = {}

    def update_current_color(self, thread_id):
        """
        Get or assign a color to a thread.
        :param thread_id - the thread id to assign the color to
        """
        color = self._thread_colors.get(thread_id)
        if not color:
            color = PALETTE[self._next_color]
            self._next_color += 1
            if self._next_color >= len(PALETTE):
                self._next_color = 0
            self._thread_colors[thread_id] = color
        self._current_color = color
        return color

    def get_current_color(self):
        """
        Get the current color in use for the formatter.
        May return None.
        :return - the current color in use
        """
        return self._current_color

class TraceFormatter:
    """
    TraceFormatter class to take output from the Frida script and print it in
    a readable way for the user.
    """
    def __init__(self, _config, _buffer_output):
        self._config = _config
        self._buffer_output = _buffer_output
        self._type_mappings = {
            "jclasses": {},
            "jmethods": {},
            "jfields": {}
        }

        self._current_ts = None
        self._color_manager = ColorManager()
        self._output_buffer = []
        self._is_64b = False

    def _update_refs(self, method, args, ret):
        if method["name"] in ["GetMethodID", "GetStaticMethodID"]:
            method_id = ret
            self._type_mappings["jmethods"][method_id] = {
                "name": args[2]["data"],
                "sig": args[3]["data"]
            }
        elif method["name"] in ["GetFieldID", "GetStaticFieldID"]:
            field_id = ret
            self._type_mappings["jfields"][field_id] = {
                "name": args[2]["data"],
                "sig": args[3]["data"]
            }
        elif method["name"] in ["FindClass", "DefineClass"]:
            class_id = ret
            self._type_mappings["jclasses"][class_id] = {
                "name": args[1]["data"]
            }

    def _print_thread_id(self, thread_id):
        print("{:15s}/* TID {:d} */{}".format(
            self._color_manager.get_current_color(),
            thread_id,
            Style.RESET_ALL
        ))

    def _print_method_name(self, struct_type, name):
        print("{:7d} ms {}[+] {}->{}{}".format(
            self._current_ts,
            self._color_manager.get_current_color(),
            struct_type,
            name,
            Style.RESET_ALL
        ))

    def _get_data_metadata(self, arg_type, value):
        opt = None
        if arg_type == "jfieldID":
            val = value
            jfields = self._type_mappings["jfields"]
            if val in jfields:
                opt = "{}:{}".format(jfields[val]["name"], jfields[val]["sig"])
            else:
                opt = "unknown"
        elif arg_type == "jmethodID":
            val = value
            jmethods = self._type_mappings["jmethods"]
            if val in jmethods:
                opt = "{}{}".format(jmethods[val]["name"], jmethods[val]["sig"])
            else:
                opt = "unknown"
        elif arg_type == "jclass":
            val = value
            jclasses = self._type_mappings["jclasses"]
            if val in jclasses:
                opt = jclasses[val]["name"]
            else:
                opt = "unknown"
        elif arg_type == "jboolean":
            if value == 0:
                opt = "false"
            else:
                opt = "true"
        return opt

    def _print_data_prefix(self):
        print("{:7d} ms {}|".format(
            self._current_ts,
            self._color_manager.get_current_color()
        ), end="")

    def _print_data_value(self, sym, value, arg_type=None, padding=0):
        opt = self._get_data_metadata(arg_type, value)

        self._print_data_prefix()

        print(sym, end=" ")

        if padding > 0:
            print(" " * padding, end="")

        if arg_type:
            print(("{:" + str(17 - padding) + "s}: {}").format(
                arg_type,
                value
            ), end="")
        else:
            print(value, end="")

        if opt:
            print(" {{ {} }}".format(
                opt
            ), end="")

        print(Style.RESET_ALL)

    def _print_data(self, block, arg_type, padding, data):
        self._print_data_value(
            block["sym"],
            block["data"]["value"],
            arg_type, padding
        )

        if self._config["show_data"]:
            self._print_additional_data(block["data"], data)

    def _print_arg_data(self, arg, arg_type=None, padding=0, data=None):
        block = {
            "sym": "-",
            "data": arg
        }
        self._print_data(block, arg_type, padding, data)

    def _print_arg_sub_data(self, arg, arg_type=None, padding=4):
        self._print_data_value(":", arg, arg_type, padding)

    def _print_ret_data(self, ret, ret_type=None, padding=0, data=None):
        block = {
            "sym": "=",
            "data": ret
        }
        self._print_data(block, ret_type, padding, data)

    def _print_additional_data(self, arg, data):
        if "data" in arg and isinstance(arg["data"], list):
            for jni_method in arg["data"]:
                self._print_arg_sub_data(
                    "{} - {}{}".format(
                        jni_method["addr"]["value"],
                        jni_method["name"]["data"],
                        jni_method["sig"]["data"]
                    )
                )
        else:
            h_d_data = None
            if "data_for" in arg or "has_data" in arg:
                h_d_data = data
            elif "data" in arg:
                if isinstance(arg["data"], (str, int)):
                    self._print_arg_sub_data(
                        arg["data"]
                    )
                else:
                    h_d_data = arg["data"]

            if h_d_data:
                h_d = hexdump.hexdump(h_d_data, result="return").split("\n")
                for line in h_d:
                    self._print_arg_sub_data(
                        line[1:]
                    )

    def _print_args(self, method, args, java_params, data):
        jni_args = method["args"]
        add_java_args = False
        for i, _ in enumerate(jni_args):
            arg_type = method["args"][i]
            if arg_type in ["...", "va_list", "jvalue*"]:
                add_java_args = True
                break

            arg = args[i]

            self._print_arg_data(
                arg,
                arg_type=arg_type,
                data=data
            )

        if add_java_args:
            if method["args"][-1] == "...":
                arg_offset = 1
                padding = 0
            else:
                padding = 4
                arg_offset = 0
            for i, _ in enumerate(java_params):
                arg = args[i + len(jni_args) - arg_offset]
                self._print_arg_sub_data(
                    arg["value"],
                    arg_type=java_params[i],
                    padding=padding
                )

    def _print_backtrace(self, backtrace):
        padding = "-" * 25
        print("{:7d} ms {}{padding}Backtrace{padding}{}".format(
            self._current_ts,
            self._color_manager.get_current_color(),
            Style.RESET_ALL,
            padding=padding
        ))

        for b_t in backtrace:
            if not b_t["module"]:
                break
            if len(b_t["address"]) > 10:
                self._is_64b = True

            if self._is_64b:
                size = 18
            else:
                size = 10

            print(("{:7d} ms {}|-> {:>" + str(size) + "s}: {} ({}){}").format(
                self._current_ts,
                self._color_manager.get_current_color(),
                b_t["address"],
                b_t["module"]["path"],
                b_t["module"]["base"],
                Style.RESET_ALL
            ))

        print()

    @classmethod
    def _is_error(cls, message):
        if message["type"] != "send":
            print("{}ERROR: {}{}".format(
                Fore.RED,
                str(message),
                Style.RESET_ALL
            ))
            return True
        return False

    @classmethod
    def _is_meta_message(cls, payload):
        if payload["type"] == "tracked_library":
            print('Traced library "{}" loaded from path "{}".'.format(
                payload["library"].split("/")[-1],
                "/".join(payload["library"].split("/")[0:-1])
            ))
            print()
            return True
        return False

    def _print_method_call(self, payload, data):
        struct_type = payload["call_type"]
        method = payload["method"]
        args = payload["args"]

        self._print_thread_id(payload["thread_id"])
        self._print_method_name(struct_type, method["name"])

        args = payload["args"]
        self._print_args(method, args, payload.get("java_params"), data)

        if payload["ret"].get("value") is not None:
            self._print_ret_data(
                payload["ret"],
                ret_type=method["ret"],
                data=data
            )

        print()

    def _update_output_buffer(self, payload, data):
        record = {
            "struct": payload["call_type"],
            "method": payload["method"],
            "thread_id": payload["thread_id"],
            "timestamp": payload["timestamp"],
        }

        if "backtrace" in payload:
            record["backtrace"] = payload["backtrace"]

        args = []

        for arg in payload["args"]:
            output_arg = {
                "value": arg["value"]
            }
            if "data_for" in arg:
                output_arg["data"] = binascii.hexlify(data).decode()
            elif "data" in arg:
                output_arg["data"] = arg["data"]
            args.append(output_arg)

        record["args"] = args

        ret = {
            "value": payload["ret"].get("value")
        }

        if "has_data" in payload["ret"]:
            ret["data"] = binascii.hexlify(data).decode()

        record["ret"] = ret

        if "java_params" in payload:
            record["java_params"] = payload["java_params"]

        self._output_buffer.append(record)

    def get_output(self):
        """
        Get an array of the raw data displayed on the console.
        :return - the raw output buffer
        """
        return self._output_buffer

    def on_message(self, message, data):
        """
        Frida on_message callback, for formatting output data.
        :param message - JSON formatted output
        :param data - binary data for some JNI method calls
        """
        if TraceFormatter._is_error(message):
            return

        payload = message["payload"]

        if TraceFormatter._is_meta_message(payload):
            return

        if self._buffer_output:
            self._update_output_buffer(message["payload"], data)

        self._current_ts = payload["timestamp"]
        method = payload["method"]
        args = payload["args"]
        ret = payload["ret"]

        self._update_refs(method, args, ret.get("value"))

        self._color_manager.update_current_color(payload["thread_id"])

        self._print_method_call(payload, data)

        if self._config["show_backtrace"]:
            self._print_backtrace(payload["backtrace"])

        print()

def _custom_script_on_message(message, data):
    print(message, data)

def _parse_args():
    parser = argparse.ArgumentParser(usage="jnitrace [options] -l libname target")
    parser.add_argument("-m", "--inject-method", choices=["spawn", "attach"],
                        default="spawn",
                        help="Specify how frida should inject into the "
                        "process.")
    parser.add_argument("-b", "--backtrace", choices=["fuzzy", "accurate", "none"],
                        default="accurate",
                        help="Print a backtrace from each JNI call.")
    parser.add_argument("-i", "--include", action="append", default=[],
                        help="A regex filter to include a JNIEnv or JavaVM method name.")
    parser.add_argument("-e", "--exclude", action="append", default=[],
                        help="A regex filter to exclude a JNIEnv or JavaVM method name.")
    parser.add_argument("--hide-data", action="store_true",
                        help="Print contents of argument.")
    parser.add_argument("--ignore-env", action="store_true",
                        help="Do not trace JNIEnv calls.")
    parser.add_argument("--ignore-vm", action="store_true",
                        help="Do not trace JavaVM calls.")
    parser.add_argument("-p", "--prepend", type=argparse.FileType("r"),
                        help="Prepend a Frida script to run before jnitrace does.")
    parser.add_argument("-a", "--append", type=argparse.FileType("r"),
                        help="Append a Frida script to run after jnitrace has started.")
    parser.add_argument("-o", "--output", type=argparse.FileType("w"),
                        help="Output trace data to a JSON formatted file.")
    parser.add_argument("-v", "--version", action='version',
                        version="%(prog)s " + __version__,
                        help="Show the installed version of jnitrace.")
    parser.add_argument("-l", "--libraries", required=True, action="append",
                        help="Specify a native libraries to track JNI "
                        "calls from. Enter * to track all libraries or"
                        " use the argument multiple times to specify "
                        "a set of libraries.")
    parser.add_argument("target",
                        help="The name of the application to trace.")
    args = parser.parse_args()

    if args.ignore_env and args.ignore_vm:
        parser.error('Ignoring both the JavaVM and JNIEnv will result in no output.')

    return args

def main():
    """
    Main function to process command arguments and to inject Frida.
    """
    jscode = resource_string("jnitrace.build", "jnitrace.js").decode()
    jscode = jscode.replace("IS_IN_REPL = true", "IS_IN_REPL = false")

    args = _parse_args()

    b_t = False

    if args.backtrace == "accurate":
        b_t = True
    elif args.backtrace == "fuzzy":
        b_t = True

    formatter = TraceFormatter({
        "show_backtrace": b_t,
        "show_data": not args.hide_data
    }, args.output is not None)

    device = frida.get_usb_device(3)
    if args.inject_method == "spawn":
        pid = device.spawn([args.target])
    else:
        pid = device.attach(args.target)

    session = device.attach(pid)

    if args.prepend:
        prepend = session.create_script(args.prepend.read(), runtime="v8")
        prepend.on("message", _custom_script_on_message)
        prepend.load()
        args.prepend.close()

    script = session.create_script(jscode, runtime="v8")
    script.on("message", formatter.on_message)
    script.load()

    script.post({
        "type": "config",
        "payload": {
            "libraries": args.libraries,
            "backtrace": args.backtrace,
            "show_data": not args.hide_data,
            "include": args.include,
            "exclude": args.exclude,
            "env": not args.ignore_env,
            "vm": not args.ignore_vm
        }
    })

    if args.append:
        append = session.create_script(args.append.read(), runtime="v8")
        append.on("message", _custom_script_on_message)
        append.load()
        args.append.close()

    if args.inject_method == "spawn":
        device.resume(pid)

    print("{}Tracing. Press any key to quit...{}".format(
        Fore.GREEN,
        Style.RESET_ALL
    ))
    try:
        input()
    except KeyboardInterrupt:
        pass

    if args.output:
        json.dump(formatter.get_output(), args.output, indent=4)
        args.output.close()

    if args.append:
        append.unload()
    script.unload()
    if args.prepend:
        prepend.unload()

    print('Stopping application (name={}, pid={})...'.format(
        args.target,
        pid
    ), end="")
    device.kill(pid)
    print("stopped.")

if __name__ == '__main__':
    main()
