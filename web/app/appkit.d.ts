// Reown AppKit registers these as custom elements at runtime; declare them for JSX/TS.
// React 19 resolves intrinsic elements from React.JSX, so augment that namespace.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "appkit-button": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      "appkit-network-button": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
