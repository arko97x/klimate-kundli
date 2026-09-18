# DesignUp 2026 flow

## URL decision

During the conference, the booth devices will use:

`designup26.klimatekundli.com`

After the conference, the permanent DesignUp pages will live at:

`klimatekundli.com/designup26`

For example:

```text
During DesignUp:
designup26.klimatekundli.com/k/abc123

After DesignUp:
klimatekundli.com/designup26/k/abc123
```

We prefer a subdomain for the live event because the DesignUp version temporarily
handles LinkedIn links, avatars, camera access, and booth sessions. Keeping it on a
separate subdomain helps keep the event experience apart from the normal public site.
It also lets us redirect the whole event site after the conference is over.

The permanent, cleaned-up Kundlis will live on the main Klimate Kundli site because
that is the long-term home of the project.

## The three flows

```mermaid
flowchart TD
    subgraph PUBLIC[Normal public flow]
        P1[Open klimatekundli.com]
        P2[Enter birth place, year, and places lived]
        P3[Generate a Kundli without LinkedIn or an avatar]
        P4[Open klimatekundli.com/k/slug]
        P5[Include it in the gallery]

        P1 --> P2 --> P3 --> P4
        P3 --> P5
    end

    subgraph EVENT[During DesignUp]
        D1[Open designup26.klimatekundli.com on a booth device]
        D2[Scan the visitor's LinkedIn]
        D3[Take a photo and generate a temporary avatar]
        D4[Discard the raw photo immediately]
        D5[Enter birth place, year, and places lived]
        D6[Generate the permanent Kundli]
        D7[Temporarily attach the LinkedIn, avatar, and three matches]
        D8[Open designup26.klimatekundli.com/k/slug]
        D9[Keep it out of gallery cards and gallery statistics]

        D1 --> D2 --> D3 --> D4 --> D5 --> D6 --> D7 --> D8
        D6 --> D9
    end

    subgraph AFTER[After DesignUp]
        A1[Stop the DesignUp input and matching experience]
        A2[Delete LinkedIn links and generated avatars]
        A3[Remove temporary access to match identities]
        A4{Has all personal information been removed?}
        A5[Keep it out of the gallery and fix the problem]
        A6[Allow the cleaned-up Kundli into the gallery]
        A7[Redirect the old DesignUp link]
        A8[Open klimatekundli.com/designup26/k/slug]

        D8 --> A1 --> A2 --> A3 --> A4
        A4 -- No --> A5 --> A4
        A4 -- Yes --> A6 --> A7 --> A8
    end
```

## Important rule

The permanent Kundli and the temporary DesignUp information should be kept separate.
The permanent Kundli contains the climate information. The temporary event information
contains the LinkedIn link, generated avatar, and identities of the three matches.

The raw photo is never stored. After DesignUp, the temporary event information is
deleted. Only after that deletion has been checked should the Kundli appear in the
gallery or redirect to its permanent page.

The old event links must continue to work. Once cleanup is complete, they should
permanently redirect like this:

```text
designup26.klimatekundli.com/k/abc123
→ klimatekundli.com/designup26/k/abc123
```

The event homepage should also redirect:

```text
designup26.klimatekundli.com
→ klimatekundli.com/designup26
```
