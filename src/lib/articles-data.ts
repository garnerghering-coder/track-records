export type ArticleCategory =
  | "Session Breakdown"
  | "Pre-Race Prediction"
  | "Post-Race Debrief"
  | "Driver Analysis"
  | "Track Analysis"
  | "Weekend Recap";

export interface ArticleImage {
  url: string;
  alt: string;
  caption?: string;
}

export interface Article {
  title: string;
  slug: string;
  date: string;
  category: ArticleCategory;
  tags: string[];
  author: string;
  heroImage: string;
  excerpt: string;
  body: string;
  images: ArticleImage[];
}

export const ARTICLE_CATEGORIES: ArticleCategory[] = [
  "Session Breakdown",
  "Pre-Race Prediction",
  "Post-Race Debrief",
  "Driver Analysis",
  "Track Analysis",
  "Weekend Recap",
];

export const articles: Article[] = [
  {
    title: "Sebring 12 Hours: Strategy Breakdown & Key Moments",
    slug: "sebring-12h-strategy-breakdown",
    date: "2026-03-01",
    category: "Session Breakdown",
    tags: ["IMSA", "Sebring", "Endurance", "Strategy"],
    author: "Track Records Editorial",
    heroImage: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1200&h=600&fit=crop",
    excerpt: "A deep dive into the pit stop strategies, caution periods, and decisive moments that shaped the 2026 Sebring 12 Hours across all classes.",
    body: `The 2026 Sebring 12 Hours delivered everything fans have come to expect from America's oldest endurance race — dramatic caution periods, bold strategy calls, and a finish that came down to the final stint.

## GTP Class: The Three-Way Battle

The opening hours saw the factory Porsche, Ferrari, and Cadillac entries trading the lead through a combination of raw pace and pit stop timing. The #7 Penske Porsche 963 established an early advantage by stretching its first stint to lap 42, three laps longer than the competition.

{{IMAGE:0}}

Ferrari's counter-strategy became apparent during the second caution period at hour four. By choosing to stay out while others pitted, the #50 AF Corse Ferrari 499P inherited a 28-second lead that they would protect for the next two hours.

## The Decisive Caution

The full-course yellow at hour eight proved to be the pivotal moment. Teams on alternate strategies converged, and the pit lane sequence that followed reshuffled the entire GTP field. Cadillac's decision to take only fuel during this stop — gambling on tire life — would prove to be the winning call.

{{IMAGE:1}}

## LMP2 & GTD: Underdog Stories

In LMP2, the #18 Era Motorsport ORECA pulled off a remarkable recovery drive after an early puncture dropped them to last in class. Their consistent pace through the night hours, combined with attrition among the leaders, brought them back to a podium finish.

The GTD class saw one of the most competitive battles in recent memory, with the top five separated by less than a lap at the halfway point. The #96 Turner Motorsport BMW M4 GT3 ultimately prevailed through superior tire management in the final four hours.

## Key Takeaways

- **Fuel strategy** was the primary differentiator in GTP, with teams averaging between 38-43 lap stints
- **Caution timing** benefited teams on offset strategies, particularly at the hour-eight yellow
- **Tire degradation** in the GTD class was more severe than expected, favoring teams that managed their rubber through the opening stints
- **Driver changes** during the night hours proved critical, with faster night drivers gaining up to 0.8s per lap over competitors`,
    images: [
      {
        url: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&h=450&fit=crop",
        alt: "Pit stop sequence during the Sebring 12 Hours",
        caption: "The pit stop sequence during hour four reshaped the GTP class order",
      },
      {
        url: "https://images.unsplash.com/photo-1541348263662-e068662d82af?w=800&h=450&fit=crop",
        alt: "Night racing at Sebring International Raceway",
        caption: "The night hours at Sebring proved decisive for multiple class battles",
      },
    ],
  },
  {
    title: "MX-5 Cup Daytona Preview: Drivers to Watch in 2026",
    slug: "mx5-cup-daytona-preview-2026",
    date: "2026-02-25",
    category: "Pre-Race Prediction",
    tags: ["MX-5 Cup", "Daytona", "Preview", "Predictions"],
    author: "Track Records Editorial",
    heroImage: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=600&fit=crop",
    excerpt: "With the 2026 MX-5 Cup season opener at Daytona approaching, we analyze the key contenders, dark horses, and storylines heading into the first round.",
    body: `The Global Mazda MX-5 Cup kicks off its 2026 season at the Daytona International Speedway road course, and the pre-season signs suggest this could be one of the most competitive fields in the series' history.

## Returning Champions & Title Contenders

Last year's championship battle went down to the wire, and several of the key players return with unfinished business. The depth of talent in the MX-5 Cup has grown significantly, with multiple drivers capable of winning on any given weekend.

{{IMAGE:0}}

The spec nature of the series means success comes down to racecraft, consistency, and the ability to extract every last tenth from identical machinery. Track position at race start has historically been one of the strongest predictors of success at Daytona.

## Rookies to Watch

The 2026 rookie class includes several karting graduates and sim-racing crossover talents who showed impressive pace in pre-season testing. While the jump to tin-top racing always presents a learning curve, the combination of raw speed and modern data analysis tools has shortened the adaptation period.

## Daytona: The Circuit Factor

The Daytona road course presents a unique challenge within the MX-5 Cup calendar. The high-speed banking section rewards bravery and aerodynamic drafting, while the infield technical sections demand precision and mechanical grip.

{{IMAGE:1}}

Key corners to watch:
- **Turn 1 (Bus Stop chicane)**: Historically the site of the most overtaking attempts and incidents
- **The Banking**: MX-5s reach their highest speeds here, and drafting is critical for passing
- **Infield Section**: The slow-speed corners where car setup and driving technique matter most

## Our Predictions

Based on pre-season testing data, historical performance, and driver trajectory analysis, here are our top picks for the Daytona opener:

1. **Polesitter prediction**: A returning front-runner with strong qualifying pace
2. **Race winner**: Expect a pack finish with the winner decided in the final two laps
3. **Best rookie**: Watch for the sim-racing crossover talents to make an immediate impact

The MX-5 Cup continues to serve as one of motorsport's best proving grounds, and the 2026 season promises to deliver another year of close, competitive racing.`,
    images: [
      {
        url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&h=450&fit=crop",
        alt: "MX-5 race cars on track",
        caption: "The spec MX-5 Cup field produces some of the closest racing in all of motorsport",
      },
      {
        url: "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800&h=450&fit=crop",
        alt: "Daytona International Speedway road course",
        caption: "The Daytona road course combines high-speed banking with technical infield sections",
      },
    ],
  },
];
