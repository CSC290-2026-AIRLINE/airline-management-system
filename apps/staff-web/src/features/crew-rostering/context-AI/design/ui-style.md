# 🎨 Airline Web App - Design System Guidelines

Guidelines and standards for designing UI components of the airline web application to ensure system consistency.

---

## 🎨 1. Theme Color Palette

Used for defining core theme colors and element statuses across the system:

| Variable Name | Hex Code | Opacity | Usage / Description |
| :--- | :--- | :--- | :--- |
| **Primary Text** | `#010101` | 100% | General body text color (non-heading text) |
| **Primary Color** | `#0F203E` | 100% | Core system color used for headings, primary buttons, and key elements |
| **Secondary Color**| `#FF9F00` | 100% | Secondary color used for highlight buttons and key focal points |
| **Card / Modal BG**| `#FFFFFF` | 100% | Background color for all cards and modal/dialog windows |
| **Border & Desc**  | `#C4C6C5` | 100% | Description text color and input/form field borders |
| **Page Background**| `#F4F6F8` | 100% | Main background color for the entire web pages |
| **Valid Status**   | `#059669` | 100% | Green color for valid/success states |
| **Valid Status BG**   | `#059669` | 30% (BG) | Green color badges (30% background opacity) |
| **Invalid / Delete**| `#B8171F` | 100% | Red color for invalid/danger states |
| **Invalid / Delete**| `#B8171F` | 30% (BG) | Red color (30% background opacity) |

---

## 🔘 2. Button Interactive States (Hovering)

Color specifications for button hover states:

- **Yellow Button:**
  * Base Color: `#FCA311`
  * Hover Color: `#C27D0C`
- **Dark Navy Blue Button:**
  * Base Color: `#14213D`
  * Hover Color: `#0A152B`

---

## 🔤 3. Typography Rules

### 3.1 Primary Font: `Inter`

#### **Large Screen (Desktop / TV) — Base: 16px**

- **Heading H1** *(Main page title / Hero headline)*
  * Font Weight: `Extra Bold`
  * Size: `48px`
- **Heading H2** *(Main section titles)*
  * Font Weight: `Extra Bold`
  * Size: `36px`
- **Heading H3** *(Card, Modal, Dashboard titles)*
  * Font Weight: `Bold`
  * Size: `28px`
- **Heading H4** *(Grouped form titles / Small sections)*
  * Font Weight: `Semi Bold`
  * Size: `22px`
- **Body Large** *(Important paragraphs / Short descriptions)*
  * Font Weight: `Regular`
  * Size: `18px`
- **Body Default** *(Normal descriptions, helper text, card content)*
  * Font Weight: `Regular`
  * Size: `16px`
- **Label Default** *(Form labels, filter labels, table labels)*
  * Font Weight: `Medium`
  * Size: `14px`
- **Action Button** *(Buttons, tabs, clickable actions)*
  * Font Weight: `Semi Bold`
  * Size: `14px`
- **Caption Meta** *(Timestamps, tiny notes, secondary table info)*
  * Font Weight: `Regular`
  * Size: `12px`

#### **Small Screen (iPad / Mobile) — Base: 14px**

- **Heading H1:** Weight `Extra Bold`, Size `32px`
- **Heading H2:** Weight `Extra Bold`, Size `26px`
- **Heading H3:** Weight `Bold`, Size `22px`
- **Heading H4:** Weight `Semi Bold`, Size `18px`
- **Body Large:** Weight `Regular`, Size `16px`
- **Body Default:** Weight `Regular`, Size `13px`
- **Label Default:** Weight `Medium`, Size `13px`
- **Action Button:** Weight `Medium`, Size `13px`
- **Caption Meta:** Weight `Regular`, Size `12px`

---

### 3.2 Secondary Font: `Merriweather`

Used for special focal points, destination names, and emotional brand taglines:

#### **Large Screen (Desktop / TV) — Base: 16px**

- **LOGO**
  * Font Weight: `Black`
  * Size: `40px`
- **Accent Title** *(Destination names, success messages, empty states)*
  * Font Weight: `Bold`
  * Size: `28px`
- **Accent Line** *(Short slogans, emotional brand lines)*
  * Font Weight: `Bold`
  * Size: `18px`

#### **Small Screen (iPad / Mobile) — Base: 14px**

- **LOGO:** Weight `Black`, Size `32px`
- **Accent Title:** Weight `Bold`, Size `22px`
- **Accent Line:** Weight `Bold`, Size `16px`

---

## 📐 4. Auto Layout, Flexbox & Component Reuse Guidelines

All UI components must adhere to **Flexbox / Auto Layout** principles to ensure flexible structures, clean spacing, no overlapping, and standardized component reuse:

### 4.1 Strict Layout & Responsive Rules
* **Strict Auto Layout (Flexbox):** All components (Cards, Modals, Navigation, Forms, Buttons) must use `display: flex` or CSS Grid. Avoid `position: absolute` except for floating badges or tooltips.
* **No Fixed Overlaps:** Never use negative margins to force elements to overlap.
* **Alignment & Content Hugging:** 
  * Use `align-items: center` and `justify-content: center` for buttons and icons.
  * Use `gap` for spacing between internal child elements.
  * Use `padding` inside containers to maintain proper breathing room.
* **Responsive & Fluid Behavior:**
  * Mobile (`< 768px`): Core elements like primary buttons should be full-width (`w-full`) for easy tapping.
  * Desktop (`>= 768px`): Expand according to content (`w-auto` / `Hug Content`) or defined standards.
  * Use `flex-wrap: wrap` in form sections or filter groups to let elements wrap smoothly on smaller screens.

### 4.2 Component Reuse & Modular Rules
* **No Duplicate Components:** If a feature requires elements like buttons, inputs, cards, or modals that match existing master components, import and reuse them directly from the `/components` folder.
* **Design Reference:** Dimensions, paddings, and auto layout properties are already defined in the core components. Do not hardcode custom sizes across individual pages.
* **Page-Specific Details:** Pass page-specific text or variants via Props (e.g., `label`, `placeholder`, `onClick`) to the shared components instead of rebuilding UI elements from scratch on each page.