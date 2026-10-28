// Registry of the currently open kebab menus.
//
// The kebab dropdown is portalled into document.body so that it escapes the
// clipping and the stacking contexts of the table it lives in. A portalled
// menu is no longer inside its dialog, so the dialog focus trap has to know
// about it to keep the menu items inside the Tab cycle. This registry is the
// link between the two.

const openMenus = new Map<Element, HTMLElement>()

/** Remembers an open menu so that the focus trap can find its items. */
export function registerOpenMenu(owner: Element, menu: HTMLElement): void {
  openMenus.set(owner, menu)
}

/** Forgets a menu that was closed. */
export function unregisterOpenMenu(owner: Element): void {
  openMenus.delete(owner)
}

/**
 * The focusable elements of every open menu that belongs to `container`.
 * A menu belongs to a container when the button that opened it is inside it.
 */
export function getOpenMenuFocusables(container: Element, selector: string): HTMLElement[] {
  const found: HTMLElement[] = []
  for (const [owner, menu] of openMenus) {
    if (!container.contains(owner)) continue
    found.push(...Array.from(menu.querySelectorAll<HTMLElement>(selector)))
  }
  return found
}
