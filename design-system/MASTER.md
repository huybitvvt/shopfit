# ShopFit visual system

Product: a Vietnamese fashion shop and personal fitting room. Native React Native app; web is a development preview of the same code.

Direction: quiet editorial fashion. Warm off-white surfaces, deep forest-green actions, generous spacing, real garment photography. Use Cormorant Garamond for editorial headings and DM Sans for labels, body copy and controls; both support Vietnamese.

The ui-ux-pro-max fashion searches supplied relevant typography and contrast guidance, but their generic showcase/glass navigation recommendations did not fit this catalog. The project uses the explicit direction above instead of persisting those unverified layout recommendations.

Source of implementation tokens: `mobile/src/theme.ts`.

| Role | Value |
| --- | --- |
| Background | #F8F7F3 |
| Paper | #FFFFFF |
| Primary text | #202A23 |
| Secondary text | #647067 |
| Primary action | #344E40 |
| Quiet accent | #E7EDE6 |
| Border | #E2E5DC |
| Destructive | #A03736 |

Spacing: 4/8 rhythm, mobile outer gutter 24, content width capped at 1180. Catalog columns: 2 on phones, 3 on tablets, 4 on wide previews. Detail and fitting room switch from stacked to two columns. Respect safe areas. Native navigation has four tabs. Use Ionicons consistently, no emoji icons.

Controls: primary height 52; icon targets 48, with expanded hit areas for compact card controls. Text may wrap for Dynamic Type. No auto-playing animations. Information and error states use text as well as color. Every input has a visible label, and every icon control has an accessible name.

Initial release is explicitly light mode. No dark-mode support is advertised.
