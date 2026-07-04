# Klimate Kundli

A climate horoscope. You tell it when you were born and which cities you have lived in, and it reads your life back to you through the planet's recent weather: the year you arrived, the monsoons you have sat through, the ice that thinned while you grew up, the carbon that piled up under your name.

I made it for *Data, Otherwise*, the exhibition at VizChitra 2026. Someone walks up to a screen, types in a birthday and a few cities, and walks away with twelve cards and a printed fold-out to take home. That is the whole thing.

## Why a kundli

A kundli is a birth chart. In the version a lot of us grew up around, an astrologer takes the exact moment and place you were born, maps where the planets sat in that sky, and tells you what kind of life that arrangement supposedly wrote for you. The premise is that your fate was set by the heavens the instant you arrived, and that a trained reader can recover it.

I wanted the shape of that and none of the planets. So the graha here are climate signals. Where an astrologer would read Saturn or the Moon, this reads the temperature of your birth year, the drift of your monsoon, the height of the sea, the debt of a country's emissions.

The joke only works because it is half true. Astrology says the sky at your birth decided your life. On a warming planet, the sky you were born under did quietly set some terms you never agreed to: a hotter baseline than your parents got, a monsoon already shifting, a coastline already on the move. None of it was your doing, and all of it is now part of your chart. The satire and the fact live in the same sentence, which is the only reason I felt it was worth building.

## What a visitor gets

Twelve cards. Each one speaks in the voice of the reading, climate as something acting on you rather than something you observe. The monsoon rewrote your fate line. Fire ruled a certain number of your years. The debt written in your name. It is meant to be a little theatrical.

Underneath every one of those lines is a real number pulled from a real record, and the card tells you where it came from and how much to trust it. The wrapper is mystical. The measurement is not.

Then there are the upaay, the remedies. A kundli reading traditionally ends with prescriptions, small acts to set your stars right. So this one prescribes things like drinking your chai a few degrees cooler for the rest of your life, or giving up a few million AI queries to offset your share of the carbon. They are jokes, and the card admits as much. Individual penance was never the fix for a structural problem, and saying so with total unearned confidence turned out to be the most honest way to make the point.

You leave with a printed sheet: a paper fortune teller, the cootie-catcher you folded in school, with your reading laid out across its creases.

## The data, honestly

The mysticism is the packaging. The spine is ordinary and real.

Temperatures come from ERA5, the reanalysis record that reaches back to 1940, served through Open-Meteo. National emissions come from Our World in Data. Atmospheric CO₂ and global sea level come from NOAA, Mauna Loa and the satellite altimetry series respectively. India's rainfall leans on the India Meteorological Department where it can. Where a card looks forward, it uses CMIP6 projections.

Every card carries its source and a confidence label, because a piece that dresses climate up as prophecy owes the visitor a way to see that the numbers are earnest. If a single line here nudges someone to go read the actual data about the place they are from, the costume did its job.

## How it got here

I rebuilt this more times than I would like to admit. It started as a localhost toy that called weather APIs live, became a precomputed database, and eventually turned into the exhibit that exists now, with its own kiosk mode, frozen shareable snapshots, and a print pipeline that fought me at every step. The app carries an internal documentation page that logs the whole march, version by version, including the ideas that got retired. That page was for me. This note is for you.

## About this repo

The code is public, and it is not looking for contributors. This is a personal exhibition project, not a product or a framework, and I am keeping it open so it can be read rather than forked and run. Poke around if you are curious how a climate reading gets assembled from a birthday and a list of cities. That is the interesting part, and it is all here.

Built with React and a small Node service. The climate data belongs to the organisations named above; the reading, and the liberties it takes, are mine.
