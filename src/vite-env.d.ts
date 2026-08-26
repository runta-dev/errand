/// <reference types="vite/client" />
import type { DesktopBridge } from "./shared/desktop";
declare global { interface Window { runtaCrew?: DesktopBridge } }
