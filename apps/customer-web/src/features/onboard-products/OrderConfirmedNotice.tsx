// Top-of-page green success notice shown on the Booking Details page
// after a customer just paid for an order. Matches the Figma's Page 8
// "Order PO-2052 confirmed. Your items are loaded for the flight."
// banner.
//
// Renders nothing when `orderId` is null (the unpreseted Booking
// Details page, which has no just-paid order to celebrate).

interface Props {
  orderId: string | null
}

export function OrderConfirmedNotice({ orderId }: Props) {
  if (!orderId) return null
  return (
    <div
      className="rounded-xl border px-6 py-4 text-[15px] leading-relaxed mb-6 mt-2"
      style={{
        background: 'oklch(0.95 0.06 148)',
        borderColor: 'oklch(0.88 0.10 148)',
        color: 'oklch(0.48 0.15 148)',
      }}
      role="status"
    >
      <p className="m-0">
        <strong className="font-semibold">Order {orderId} confirmed.</strong> Your items are loaded for the flight.
      </p>
    </div>
  )
}
