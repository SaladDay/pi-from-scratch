declare module "lucide-react/dist/esm/icons/*.mjs" {
  import type { ComponentType, SVGProps } from "react";

  type IconProps = SVGProps<SVGSVGElement> & {
    size?: number | string;
    absoluteStrokeWidth?: boolean;
  };

  const Icon: ComponentType<IconProps>;
  export default Icon;
}
