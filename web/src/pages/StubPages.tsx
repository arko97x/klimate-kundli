import { KundliResultLayout } from "@/expt/KundliResultLayout";

export function AboutPage() {
  return (
    <KundliResultLayout>
      <div className="mx-auto max-w-2xl px-4 py-8 text-foreground">
        <h1 className="mb-6 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          About the Project
        </h1>
        <p className="mb-4 text-lg text-muted-foreground leading-relaxed">
          A kundli is a birth chart. In Hindu astrology, the sky at the moment
          and place of your birth is drawn as a twelve-house diagram, and a
          reader traces the shape of your life through it. Klimate Kundli
          borrows that form and fills it with weather records instead of
          planets: a personal horoscope for a planet in transition.
        </p>
        <p className="mb-4 text-lg text-muted-foreground leading-relaxed">
          Tell it when you were born and the cities you have lived in, and it
          returns a reading of twelve cards: how much warmer your birth month
          runs now than it did then, the hottest years you have lived through,
          how far your city&apos;s climate has drifted toward some other place
          on the map, what the Arctic has lost since you arrived. Like an
          astrologer, it even prescribes remedies, and leaves you to sit with
          the gap between personal gestures and planetary-scale action. Each
          reading is different because each life covers a different slice of the
          record.
        </p>
        <p className="mb-4 text-lg text-muted-foreground leading-relaxed">
          The project was conceived in response to{" "}
          <a
            href="https://vizchitra.com/2026/exhibition"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            <em>Data, Otherwise</em>
          </a>
          ,{" "}
          <a
            href="https://vizchitra.com/2026"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            VizChitra 2026
          </a>
          &apos;s exhibition on climate, through data you can experience. The
          exhibition opened on 3 July 2026 at{" "}
          <a
            href="https://bangaloreinternationalcentre.org/"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Bangalore International Centre
          </a>
          , Bengaluru. There, visitors typed in their cities and left with a
          printed chart. This site is the same instrument, minus the printer.
        </p>
        <p className="mb-2 text-lg text-muted-foreground leading-relaxed">
          The numbers are real; every one traces to a public scientific dataset,
          and nothing is generated at read time:
        </p>
        <ul className="mb-4 list-disc space-y-1.5 pl-6 text-lg text-muted-foreground leading-relaxed">
          <li>
            Daily temperature and rainfall from 1940 onward come from the ERA5
            reanalysis via{" "}
            <a
              href="https://open-meteo.com/"
              className="underline underline-offset-2 hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              Open-Meteo
            </a>
            , with{" "}
            <a
              href="https://power.larc.nasa.gov/"
              className="underline underline-offset-2 hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              NASA POWER
            </a>{" "}
            filling gaps from 1981.
          </li>
          <li>
            Temperature extremes near Indian cities are refined with{" "}
            <a
              href="https://mausam.imd.gov.in/"
              className="underline underline-offset-2 hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              India Meteorological Department
            </a>{" "}
            station records.
          </li>
          <li>
            National CO₂ emissions come from{" "}
            <a
              href="https://ourworldindata.org/co2-emissions"
              className="underline underline-offset-2 hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              Our World in Data
            </a>
            , and atmospheric CO₂ from{" "}
            <a
              href="https://gml.noaa.gov/ccgg/trends/"
              className="underline underline-offset-2 hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              NOAA Mauna Loa
            </a>
            .
          </li>
          <li>
            Arctic September sea-ice extent comes from the{" "}
            <a
              href="https://nsidc.org/data/seaice_index"
              className="underline underline-offset-2 hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              National Snow and Ice Data Center
            </a>
            , and global mean sea level from{" "}
            <a
              href="https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/"
              className="underline underline-offset-2 hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              NOAA/NESDIS STAR
            </a>
            .
          </li>
        </ul>
        <p className="mb-4 text-lg text-muted-foreground leading-relaxed">
          Every card names its source and a confidence level, and where the
          record is thin, the card says so.
        </p>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Saved kundlis are public and anonymous; a shared chart shows a birth
          city and a year, nothing else. The astrological framing is a costume.
          No card predicts anything. Each one describes, from the measurements
          we have, the climate your life has already passed through.
        </p>

        <hr className="my-8 border-border" />

        <h2 className="mb-4 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Colophon
        </h2>
        <p className="mb-4 text-lg text-muted-foreground leading-relaxed">
          Klimate Kundli is made by{" "}
          <a
            href="https://www.linkedin.com/in/nithyakirti/"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Nithya Kirti M.
          </a>{" "}
          and{" "}
          <a
            href="https://www.linkedin.com/in/arkoprabho-bhattacharjee/"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Arkoprabho Bhattacharjee
          </a>
          .
        </p>
        <p className="mb-4 text-lg text-muted-foreground leading-relaxed">
          <a
            href="https://www.linkedin.com/in/debanshub/"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Debanshu Bhaumik
          </a>
          ,{" "}
          <a
            href="https://www.sm-iitk.in/home"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Siddhartha Mukherjee
          </a>
          , and{" "}
          <a
            href="https://www.linkedin.com/in/aditibhat7/"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Aditi Bhat
          </a>{" "}
          mentored this project. Thank you for the patience and the relentless
          support as we navigated the trenches of data viz for the first time
          ever.
        </p>
        <p className="mb-4 text-lg text-muted-foreground leading-relaxed">
          <a
            href="https://www.linkedin.com/in/mathuramg/"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Mathura
          </a>{" "}
          let us hang out at Paper Crane Lab and use its resources, and lent us
          her 30-year-old childhood parrot stuffed toy. Syed bhai is one helluva
          tailor! Ganesh at{" "}
          <a
            href="https://aruncadd.com/"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Arun CADD printers
          </a>{" "}
          helped us laser cut with precision and speed.
        </p>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Thanks are also in order to the countless other folx who took the time
          to give us early and constructive feedback.
        </p>

        <hr className="my-8 border-border" />

        <h2 className="mb-4 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Contact Us
        </h2>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Write to us at{" "}
          <a
            href="mailto:klimatekundli@gmail.com"
            className="underline underline-offset-2 hover:text-foreground"
          >
            klimatekundli@gmail.com
          </a>
          .
        </p>
      </div>
    </KundliResultLayout>
  );
}

export function PrivacyPage() {
  return (
    <KundliResultLayout>
      <div className="mx-auto max-w-2xl px-4 py-8 text-foreground">
        <h1 className="mb-6 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mb-4 text-lg text-muted-foreground leading-relaxed">
          Your privacy is important to us. Any information you enter (birth
          year, birth city, and lived cities) is processed locally on your
          device or sent to our caching APIs to compute climate cards.
        </p>
        <p className="text-lg text-muted-foreground leading-relaxed">
          We do not sell, rent, or store your personal identifiers. Generated
          climate horoscopes are stored anonymously and can be accessed by their
          unique slug.
        </p>
      </div>
    </KundliResultLayout>
  );
}

export function DisclaimerPage() {
  return (
    <KundliResultLayout>
      <div className="mx-auto max-w-2xl px-4 py-8 text-foreground">
        <h1 className="mb-6 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Disclaimer
        </h1>
        <p className="mb-4 text-lg text-muted-foreground leading-relaxed">
          The horoscopes generated by this tool are for educational, artistic,
          and speculative purposes only. While we use real historical climate
          data from Open-Meteo, OWID, and IMD, these horoscopes do not
          constitute scientific forecasts or actual astrological advice.
        </p>
      </div>
    </KundliResultLayout>
  );
}

export function KlimateTwinPage() {
  return (
    <KundliResultLayout>
      <div className="mx-auto max-w-2xl px-4 py-8 text-foreground">
        <h1 className="mb-6 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Find Your Climate Twin
        </h1>
        <p className="mb-4 text-lg text-muted-foreground leading-relaxed">
          This feature will allow you to find others who share similar climate
          signatures or lived experiences across space and time.
        </p>
        <p className="text-lg text-muted-foreground leading-relaxed font-semibold">
          Coming soon!
        </p>
      </div>
    </KundliResultLayout>
  );
}
