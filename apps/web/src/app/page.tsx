import { LandingHeader } from "@/components/landing-header";
import { LandingHero } from "@/components/landing-hero";
import { FeatureCards } from "@/components/feature-cards";
import { HowItWorksBento } from "@/components/how-it-works-bento";
import { PrinciplesSection } from "@/components/principles-section";
import { EnvironmentsSection } from "@/components/environments-section";
import { LivePreviewSection } from "@/components/live-preview-section";
import { LandingFooter } from "@/components/landing-footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-black text-white antialiased" id="top">
      <LandingHeader />

      <main className="flex-1">
        <LandingHero />

        <div className="max-w-7xl lg:max-w-[80rem] mx-auto px-6">
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        </div>

        <FeatureCards />

        <div className="max-w-7xl lg:max-w-[80rem] mx-auto px-6">
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        </div>

        <HowItWorksBento />

        <PrinciplesSection />

        <div className="max-w-7xl lg:max-w-[80rem] mx-auto px-6">
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        </div>

        <EnvironmentsSection />

        <LivePreviewSection />
      </main>

      <LandingFooter />
    </div>
  );
}
