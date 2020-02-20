import {Platform} from "../models/platform";

const bundleToPlatform: {[bundle: string]: Platform} = {
    "uk.co.guardian.iphone2": Platform.Ios,
    "uk.co.guardian.gce": Platform.IosEdition,
    "uk.co.guardian.puzzles": Platform.IosPuzzles
};

export function fromAppleBundle(bundle?: string): Platform | undefined {
    return (bundle) ? bundleToPlatform[bundle] : undefined;
}

const packageToPlatform: {[packageName: string]: Platform} = {
    "com.guardian": Platform.Android,
    "com.guardian.debug": Platform.Android,
    "com.guardian.editions": Platform.AndroidEdition,
    "uk.co.guardian.puzzles": Platform.AndroidPuzzles
};

export function fromGooglePackageName(packageName: string): Platform | undefined {
    return packageToPlatform[packageName];
}