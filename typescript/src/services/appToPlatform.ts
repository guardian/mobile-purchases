import { Platform } from '../models/platform';

const bundleToPlatform: Record<string, Platform> = {
    'uk.co.guardian.iphone2': Platform.Ios,
    'uk.co.guardian.gce': Platform.IosEdition,
    'uk.co.guardian.puzzles': Platform.IosPuzzles,
    'uk.co.guardian.Feast': Platform.IosFeast,
};

export function appleBundleToPlatform(bundle?: string): Platform | undefined {
    return bundle ? bundleToPlatform[bundle] : undefined;
}

const packageToPlatform: Record<string, Platform> = {
    'com.guardian': Platform.Android,
    'com.guardian.debug': Platform.Android,
    'com.guardian.editions': Platform.AndroidEdition,
    'uk.co.guardian.puzzles': Platform.AndroidPuzzles,
    'uk.co.guardian.feast': Platform.AndroidFeast,
};

export function googlePackageNameToPlatform(packageName: string): Platform | undefined {
    return packageToPlatform[packageName];
}
