import hero from './assets/hero-aircraft.jpg'
import { LoyaltyBanner } from './LoyaltyBanner'
import { SearchCard } from './SearchCard'
import { SiteFooter } from './SiteFooter'
import { TrendingDestinations } from './TrendingDestinations'

/** Public landing page, built from the "Composite / Homepage v2" frame in the design file. */
export function HomePage() {
  return (
    // Brand colours only: shadcn components below keep their stock size, radius and spacing and read these variables.
    // The select list and calendar popups render in a portal outside this element, so they keep the app's neutral theme.
    <div data-full-bleed className="flex-1 bg-soft [--primary-foreground:#ffffff] [--primary:var(--color-navy)] [--ring:var(--color-navy)]">
      <main>
        <section className="relative isolate flex flex-col justify-end bg-navy">
          <img src={hero} alt="" className="absolute inset-0 -z-20 size-full object-cover object-[70%_center]" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[rgba(20,33,61,0.85)] via-[rgba(20,33,61,0.4)] via-60% to-transparent md:from-[rgba(20,33,61,0.78)] md:via-[rgba(20,33,61,0.35)] md:to-[rgba(20,33,61,0)]" />
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-16 px-4 pt-14 sm:px-6 md:gap-24 md:pt-24 lg:pt-[100px]">
            <div className="flex max-w-[520px] flex-col gap-4">
              <h1 className="m-0 text-6xl leading-none font-bold tracking-tight text-white md:text-7xl lg:text-[90px]">
                Where to <span className="block text-[#ff9e00]">next?</span>
              </h1>
              <p className="max-w-[400px] text-xl/normal text-white/90">
                Search flights, check in online or ship cargo with Flython Airlines.
              </p>
            </div>
            <div className="-mb-6">
              <SearchCard />
            </div>
          </div>
        </section>

        <div className="mx-auto flex max-w-[1200px] flex-col gap-16 px-4 pt-24 pb-20 sm:px-6 md:gap-[72px]">
          <TrendingDestinations />
          <LoyaltyBanner />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
