import hero from './assets/hero-aircraft.jpg'
import { LoyaltyBanner } from './LoyaltyBanner'
import { SearchCard } from './SearchCard'
import { SiteFooter } from './SiteFooter'
import { TrendingDestinations } from './TrendingDestinations'

/** Public landing page, built from the "Composite / Homepage v2" frame in the design file. */
export function HomePage() {
  return (
    <div data-full-bleed className="flex-1 bg-muted selection:bg-brand-accent/40 selection:text-navy">
      <main>
        <section className="relative isolate">
          {/* A fixed-height photo band. The search form flows normally and straddles its lower edge, so the form can grow
              (multi-city) without pushing the photo or hiding the aircraft, which is anchored into the visible part. */}
          <div className="absolute inset-x-0 top-0 -z-10 h-[26rem] overflow-hidden bg-navy md:h-[540px]">
            {/* The largest paint on the page, so it loads first and has its size reserved. */}
            <img
              src={hero}
              alt=""
              width={1672}
              height={941}
              fetchPriority="high"
              decoding="async"
              className="size-full object-cover object-[70%_75%]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[rgba(20,33,61,0.85)] via-[rgba(20,33,61,0.4)] via-60% to-transparent md:from-[rgba(20,33,61,0.78)] md:via-[rgba(20,33,61,0.35)] md:to-[rgba(20,33,61,0)]" />
          </div>
          {/* Tight enough that the whole search form is on the first screen of a laptop, since searching is the page's job. */}
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 pt-10 sm:px-6 md:gap-10">
            {/* The one authored moment: the headline and then the search settle in once. Skipped for reduced motion. */}
            <div className="flex max-w-[520px] animate-in flex-col gap-4 duration-700 ease-out fade-in slide-in-from-bottom-4 fill-mode-backwards motion-reduce:animate-none">
              <h1 className="m-0 font-serif text-[2rem]/10 font-bold tracking-[-0.02em] text-white md:text-display">
                Where to <span className="block text-brand-accent">next?</span>
              </h1>
              <p className="max-w-[400px] text-xl/normal text-white/90">
                Search flights, check in online or ship cargo with Flython Airlines.
              </p>
            </div>
            <div
              className="animate-in duration-700 ease-out fade-in slide-in-from-bottom-4 fill-mode-backwards motion-reduce:animate-none"
              style={{ animationDelay: '150ms' }}
            >
              <SearchCard />
            </div>
          </div>
        </section>

        <div className="mx-auto flex max-w-[1200px] flex-col gap-16 px-4 pt-16 pb-20 sm:px-6 md:gap-[72px]">
          <TrendingDestinations />
          <LoyaltyBanner />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
