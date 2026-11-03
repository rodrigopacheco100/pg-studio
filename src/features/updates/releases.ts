import changelog from "../../../CHANGELOG.md?raw";
import { parseChangelog } from "./changelog";

/** The version of this build. */
export const APP_VERSION = __APP_VERSION__;

/** Every release in the bundled CHANGELOG.md, newest first. */
export const RELEASES = parseChangelog(changelog);
