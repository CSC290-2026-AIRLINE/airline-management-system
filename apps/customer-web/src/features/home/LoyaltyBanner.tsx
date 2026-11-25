import { Link } from '@tanstack/react-router'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription } from '@customer-web/components/ui/card'
import royalty from './assets/royalty.jpg'

export function LoyaltyBanner() {
  return (
    <section aria-labelledby="loyalty-heading">
      <Card className="relative gap-0 overflow-hidden border-0 bg-navy py-0 text-white">
        <img src={royalty} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-60 mix-blend-luminosity" />
        {/* A dark scrim so the white copy keeps 4.5:1 over the brightest part of the photo. */}
        <div className="absolute inset-0 bg-gradient-to-r from-navy/95 via-navy/80 to-navy/55" />
        <CardContent className="relative flex flex-col gap-6 py-8 md:flex-row md:items-center md:justify-between md:gap-10">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 id="loyalty-heading" className="m-0 text-heading text-white">
              Earn miles on every flight
            </h2>
            <CardDescription className="text-base text-white">
              Join FlySmiles free, earn miles on every flight you book, and spend them on award seats and tier benefits.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-brand-accent text-on-brand-accent hover:bg-brand-accent/90">
              <Link to="/login">Join for free</Link>
            </Button>
            <Button asChild variant="outline" className="border-white bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link to="/loyalty/benefits">View benefits</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
