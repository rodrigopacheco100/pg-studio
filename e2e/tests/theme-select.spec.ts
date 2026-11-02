import { expect, test } from "../support/test";

// The options of a dropdown must follow the theme (a native <select> list ignores it in some webviews).
test("a dropdown's options use the theme's popover colors in both themes", async ({ studio, page }) => {
  const settings = await studio.openSettings("Appearance");
  const theme = settings.getByLabel("Theme");

  const optionColors = async () => {
    await theme.click();
    const option = page.getByRole("option", { name: "Dark", exact: true });
    const colors = await option.evaluate((el) => {
      const list = el.closest("[data-slot=select-content]")!;
      const style = getComputedStyle(list);
      return { background: style.backgroundColor, text: getComputedStyle(el).color };
    });
    await page.keyboard.press("Escape");
    return colors;
  };

  const dark = await optionColors();
  await studio.choose(theme, "Light");
  const light = await optionColors();

  expect(dark.background).not.toBe(light.background);
  expect(dark.text).not.toBe(light.text);
});
