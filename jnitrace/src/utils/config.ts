class Config {
    private static instance: Config | undefined;

    private readonly _libsToTrack: string[];
    private readonly _backtrace: string;
    private readonly _showData: boolean;
    private readonly _include: string[];
    private readonly _exclude: string[];
    private readonly _includeExport: string[];
    private readonly _excludeExport: string[];
    private readonly _env: boolean;
    private readonly _vm: boolean;

    private _hostInitialised: boolean;

    private constructor(libsToTrack: string[] = ["*"],
        backtrace: string = "accurate",
        showData: boolean = true,
        include: string[] = [],
        exclude: string[] = [],
        includeExport: string[] = [],
        excludeExport: string[] = [],
        env: boolean = true,
        vm: boolean = true) {
        this._libsToTrack = libsToTrack;
        this._backtrace = backtrace;
        this._showData = showData;
        this._include = include;
        this._exclude = exclude;
        this._includeExport = includeExport;
        this._excludeExport = excludeExport;
        this._env = env;
        this._vm = vm;

        this._hostInitialised = false;
    }

    public get libsToTrack(): string[] {
        return this._libsToTrack;
    }

    public get backtrace(): string {
        return this._backtrace;
    }

    public get showData(): boolean {
        return this._showData;
    }

    public get include(): string[] {
        return this._include;
    }

    public get exclude(): string[] {
        return this._exclude;
    }

    public get includeExport(): string[] {
        return this._includeExport;
    }

    public get excludeExport(): string[] {
        return this._excludeExport;
    }

    public get env(): boolean {
        return this._env;
    }

    public get vm(): boolean {
        return this._vm;
    }

    public static initialised(): boolean {
        if (Config.instance === undefined) {
            return false;
        } else {
            return Config.instance._hostInitialised;
        }
    }

    public static getInstance(
        libsToTrack?: string[],
        backtrace? : string,
        showData? : boolean,
        include? : string[],
        exclude? : string[],
        includeExport? : string[],
        excludeExport? : string[],
        env? : boolean,
        vm? : boolean
    ): Config {
        if (libsToTrack !== undefined &&
                backtrace !== undefined &&
                showData !== undefined &&
                include !== undefined &&
                exclude !== undefined &&
                includeExport !== undefined &&
                excludeExport !== undefined &&
                env !== undefined &&
                vm !== undefined) {
            Config.instance = new Config(libsToTrack, backtrace, showData,
                include, exclude, includeExport, excludeExport, env, vm);
            Config.instance._hostInitialised = true;
        } else if (Config.instance === undefined) {
            Config.instance = new Config();
        }
        return Config.instance;
    }
};

export { Config };