import mark from '@customer-web/assets/flython-mark.svg'

/** Flython Airline logo (light theme) from the design file: the mark plus a Merriweather-style serif wordmark. */
export default function BrandLogo() {
  return (
    <span className="flex items-center gap-2.5 text-[#04234b]">
      <img src={mark} alt="" width={46} height={24} className="shrink-0" />
      <span
        className="flex flex-col gap-px font-bold leading-none"
        style={{ fontFamily: "Merriweather, Georgia, 'Times New Roman', serif" }}
      >
        <span className="text-[22px]">Flython</span>
        <span className="text-[6px] tracking-[0.33em]">AIRLINE</span>
      </span>
    </span>
  )
}
