import Image from "next/image";

type BrandLogoProps = {
  variant?: "symbol" | "full";
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ variant = "symbol", className = "", priority = false }: BrandLogoProps) {
  return (
    <span className={`brand-logo brand-logo--${variant} ${className}`.trim()} aria-label="عيادة الريم">
      <Image
        src="/clinic-logo.png"
        alt="شعار عيادة الريم"
        width={1254}
        height={1254}
        priority={priority}
        sizes={variant === "full" ? "(max-width: 760px) 180px, 220px" : "72px"}
      />
    </span>
  );
}
