import Image from "next/image";

const BUPERS_SEAL = "/brand/bupers-seal.png";

type NavyEmblemProps = {
  className?: string;
  size?: number;
  /** @deprecated Kept for call-site compat; image is always the official seal. */
  bold?: boolean;
  priority?: boolean;
};

export default function NavyEmblem({
  className = "",
  size = 48,
  priority = false,
}: NavyEmblemProps) {
  return (
    <Image
      src={BUPERS_SEAL}
      alt="Seal of the Bureau of Naval Personnel, United States Navy"
      width={size}
      height={size}
      priority={priority}
      className={`object-contain ${className}`}
    />
  );
}
