import { cn } from "@/lib/utils";

/**
 * The product wordmark.
 *
 * It was inlined as the same pair of spans in seven files — the site header,
 * the footer, the admin sidebar, `/super`, and the login, onboarding and
 * reset-password cards. The 10 Aug rename had to touch all seven, which is
 * the argument for it being one component instead.
 *
 * The italic-primary second half is not decoration: DS-01 uses an italic
 * accent inside otherwise plain type as the brand's signature device (see
 * doc 05), and the wordmark is where that device is established. Keep the
 * accent if the name changes again.
 */
const SIZES = {
  lg: "text-lg",
  xl: "text-xl",
} as const;

export function Wordmark({
  size = "xl",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline font-display", SIZES[size], className)}>
      <span>Activ</span>
      <span className="italic text-primary">-HR</span>
    </span>
  );
}
