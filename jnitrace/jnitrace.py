"""
Main JNITrace python script to inject the JNITracing javascript into a target
process.
"""

import argparse
import binascii
import json
import re

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

AUX_OPTION_PATTERN = re.compile(r"(.+)=\((string|bool|int)\)(.+)")

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

        self._current_ts = None
        self._color_manager = ColorManager()
        self._output_buffer = []
        self._is_64b = False

    def _print_thread_id(self, thread_id):
        print("{}{:16s}/* TID {:d} */{}".format(
            Fore.WHITE,
            self._color_manager.get_current_color(),
            thread_id,
            Style.RESET_ALL
        ))

    def _print_method_name(self, struct_type, name):
        print("{}{:7d} ms {}[+] {}->{}{}".format(
            Fore.WHITE,
            self._current_ts,
            self._color_manager.get_current_color(),
            struct_type,
            name,
            Style.RESET_ALL
        ))

    @classmethod
    def _get_data_metadata(cls, arg_type, value):
        opt = None
        if arg_type == "jboolean":
            if value == 0:
                opt = "false"
            else:
                opt = "true"
        return opt

    def _print_data_prefix(self):
        print("{}{:7d} ms {}|".format(
            Fore.WHITE,
            self._current_ts,
            self._color_manager.get_current_color()
        ), end="")

    # pylint: disable=too-many-arguments
    def _print_data_value(self, sym, value, arg_type=None, opt=None, padding=0):
        if not opt:
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
            print("    {{ {} }}".format(
                opt
            ), end="")

        print(Style.RESET_ALL)

    def _print_data(self, block, arg_type, padding, data):
        self._print_data_value(
            block["sym"],
            block["data"]["value"],
            arg_type=arg_type,
            opt=block["data"].get("metadata"),
            padding=padding
        )

        if self._config["show_data"]:
            self._print_additional_data(block["data"], data)

    def _print_arg_data(self, arg, arg_type=None, padding=0, data=None):
        block = {
            "sym": "-",
            "data": arg
        }
        self._print_data(block, arg_type, padding, data)

    def _print_arg_sub_data(self, arg, arg_type=None, opt=None, padding=4):
        self._print_data_value(
            ":",
            arg,
            arg_type=arg_type,
            opt=opt,
            padding=padding
        )

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

            if arg_type == "...":
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
                    opt=arg.get("metadata"),
                    padding=padding
                )

    @classmethod
    def _create_backtrace_symbol(cls, module, symbol):
        symbol_name = symbol["name"]
        module_name = module["name"]
        if not symbol_name:
            symbol_name = hex(
                int(symbol["address"], 16) - int(module["base"], 16)
            )
        if "+" not in symbol_name:
            return module_name + "!" + symbol_name
        return symbol_name

    def _calculate_backtrace_lengths(self, backtrace):
        max_name = 0
        max_len = 0
        size = 10

        for b_t in backtrace:
            if not b_t["module"]:
                break

            if len(b_t["address"]) > 10:
                self._is_64b = True

            if self._is_64b:
                size = 18
            else:
                size = 10

            break

        for b_t in backtrace:
            if not b_t["module"]:
                break

            symbol_name = self._create_backtrace_symbol(
                b_t["module"], b_t["symbol"]
            )

            b_t_len = len(("|-> {:>" + str(size) + "s}: {} ({}:{})").format(
                b_t["address"],
                symbol_name,
                b_t["module"]["name"],
                b_t["module"]["base"]
            ))

            if b_t_len > max_len:
                max_len = b_t_len
            if len(symbol_name) > max_name:
                max_name = len(symbol_name)

        return max_len, max_name, size

    def _print_backtrace(self, backtrace):
        max_len, max_name, size = self._calculate_backtrace_lengths(backtrace)

        padding = "-" * (round(max_len / 2) - int(len("Backtrace") / 2))
        print("{:7d} ms {}{padding}Backtrace{padding}{}".format(
            self._current_ts,
            self._color_manager.get_current_color(),
            Style.RESET_ALL,
            padding=padding
        ))

        for b_t in backtrace:
            if not b_t["module"]:
                break

            symbol_name = self._create_backtrace_symbol(
                b_t["module"], b_t["symbol"]
            )

            format_str = "{:7d} ms {}|-> {:>" \
                            + str(size) + "s}: {:>" \
                                + str(max_name) + "s} ({}:{}){}"

            print(format_str.format(
                self._current_ts,
                self._color_manager.get_current_color(),
                b_t["address"],
                symbol_name,
                b_t["module"]["name"],
                b_t["module"]["base"],
                Style.RESET_ALL
            ))

        print()

    @classmethod
    def _is_error(cls, message):
        if message["type"] != "send" or message["payload"]["type"] == "error":
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
            if "metadata" in arg:
                output_arg["metadata"] = arg["metadata"]
            args.append(output_arg)

        record["args"] = args

        ret = {
            "value": payload["ret"].get("value")
        }

        if "has_data" in payload["ret"]:
            ret["data"] = binascii.hexlify(data).decode()
        if "metadata" in payload["ret"]:
            ret["metadata"] = payload["ret"]["metadata"]

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

        self._color_manager.update_current_color(payload["thread_id"])

        self._print_method_call(payload, data)

        if self._config["show_backtrace"]:
            self._print_backtrace(payload["backtrace"])

        print()

def _custom_script_on_message(message, data):
    print(message, data)

def _parse_aux_option(option):
    aux_params = AUX_OPTION_PATTERN.match(option)
    if aux_params is None:
        error = "expected name=(type)value, e.g. “uid=(int)42”;"
        error += " supported types are: string, bool, int"
        raise ValueError(error)
    name = aux_params.group(1)
    type_decl = aux_params.group(2)
    raw_value = aux_params.group(3)
    if type_decl == 'string':
        value = raw_value
    elif type_decl == 'bool':
        value = bool(raw_value)
    else:
        value = int(raw_value)

    return (name, value)

def _parse_args():
    parser = argparse.ArgumentParser(usage="jnitrace [options] -l libname target")
    parser.add_argument("-m", "--inject-method", choices=["spawn", "attach"],
                        default="spawn",
                        help="Specify how frida should inject into the "
                        "process.")
    parser.add_argument("-R", "--remote", nargs="?", const="127.0.0.1:27042",
                        help="Connect to remote Frida server in the format IP:PORT")
    parser.add_argument("-b", "--backtrace", choices=["fuzzy", "accurate", "none"],
                        default="accurate",
                        help="Print a backtrace from each JNI call.")
    parser.add_argument("-i", "--include", action="append", default=[],
                        help="A regex filter to include a JNIEnv or JavaVM method name.")
    parser.add_argument("-e", "--exclude", action="append", default=[],
                        help="A regex filter to exclude a JNIEnv or JavaVM method name.")
    parser.add_argument("-I", "--include-export", action="append", default=[],
                        help="A list of library exports to trace from.")
    parser.add_argument("-E", "--exclude-export", action="append", default=[],
                        help="A list of library exports to avoid tracing from.")
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
    parser.add_argument("--aux", action="append", metavar="name=(string|bool|int)value",
                        dest="aux", default=[],
                        help="set aux option when spawning")
    parser.add_argument("target",
                        help="The name of the application to trace.")
    args = parser.parse_args()

    if args.ignore_env and args.ignore_vm:
        parser.error('Ignoring both the JavaVM and JNIEnv will result in no output.')

    return args

def _wait_for_finish():
    print("{}Tracing. Press any key to quit...{}".format(
        Fore.GREEN,
        Style.RESET_ALL
    ))
    try:
        input()
    except KeyboardInterrupt:
        pass

def _finish(args, device, pid, scripts):
    print('Stopping application (name={}, pid={})...'.format(
        args.target,
        pid
    ), end="")
    try:
        if args.append:
            scripts["append"].unload()
        scripts["script"].unload()
        if args.prepend:
            scripts["prepend"].unload()

        device.kill(pid)
    except frida.InvalidOperationError:
        pass
    finally:
        print("stopped.")

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

    if args.remote:
        device_manager = frida.get_device_manager()
        device = device_manager.add_remote_device(args.remote)
    else:
        device = frida.get_usb_device(3)

    if args.inject_method == "spawn":
        aux_kwargs = {}
        if args.aux is not None:
            aux_kwargs = dict([_parse_aux_option(o) for o in args.aux])
        pid = device.spawn([args.target], **aux_kwargs)
    else:
        pid = device.get_process(args.target).pid

    session = device.attach(pid)
    scripts = {}

    if args.prepend:
        prepend = session.create_script(args.prepend.read())
        prepend.on("message", _custom_script_on_message)
        prepend.load()
        args.prepend.close()
        scripts["prepend"] = prepend

    script = session.create_script(jscode)
    script.on("message", formatter.on_message)
    script.load()
    scripts["script"] = script

    script.post({
        "type": "config",
        "payload": {
            "libraries": args.libraries,
            "backtrace": args.backtrace,
            "show_data": not args.hide_data,
            "include": args.include,
            "exclude": args.exclude,
            "include_export": args.include_export,
            "exclude_export": args.exclude_export,
            "env": not args.ignore_env,
            "vm": not args.ignore_vm
        }
    })

    if args.append:
        append = session.create_script(args.append.read())
        append.on("message", _custom_script_on_message)
        append.load()
        args.append.close()
        scripts["append"] = append

    if args.inject_method == "spawn":
        device.resume(pid)

    _wait_for_finish()

    if args.output:
        json.dump(formatter.get_output(), args.output, indent=4)
        args.output.close()

    _finish(args, device, pid, scripts)

if __name__ == '__main__':
    main()
