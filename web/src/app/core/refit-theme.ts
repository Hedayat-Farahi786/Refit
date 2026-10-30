import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Refit's own look: warm neutrals, ink-black actions and one quiet blue for focus and progress.
 * It is fixed on purpose. Brands are for the apps Refit modernizes, not for Refit itself.
 */
const SAND = {
  50: '#faf9f7',
  100: '#f3f2ef',
  200: '#e8e6e1',
  300: '#d8d5ce',
  400: '#aeaaa1',
  500: '#858077',
  600: '#66625a',
  700: '#4a4741',
  800: '#2f2d29',
  900: '#1f1e1b',
  950: '#151412',
};

const surface = { 0: '#ffffff', ...SAND };

export const RefitPreset = definePreset(Aura, {
  primitive: {
    borderRadius: { none: '0', xs: '4px', sm: '6px', md: '8px', lg: '10px', xl: '14px' },
  },
  semantic: {
    transitionDuration: '0.15s',
    focusRing: { width: '2px', style: 'solid', color: '{blue.500}', offset: '2px', shadow: 'none' },
    primary: SAND,
    formField: {
      paddingX: '0.75rem',
      paddingY: '0.55rem',
      borderRadius: '{border.radius.md}',
      focusRing: { width: '0', style: 'none', color: 'transparent', offset: '0', shadow: '0 0 0 3px color-mix(in srgb, {blue.500} 22%, transparent)' },
    },
    overlay: {
      select: { borderRadius: '{border.radius.lg}', shadow: '0 12px 32px -12px rgb(21 20 18 / 0.25), 0 2px 6px -2px rgb(21 20 18 / 0.08)' },
      popover: { borderRadius: '{border.radius.lg}', padding: '0.75rem', shadow: '0 12px 32px -12px rgb(21 20 18 / 0.25), 0 2px 6px -2px rgb(21 20 18 / 0.08)' },
      modal: { borderRadius: '{border.radius.xl}', padding: '1.5rem', shadow: '0 32px 64px -24px rgb(21 20 18 / 0.35), 0 4px 12px -4px rgb(21 20 18 / 0.1)' },
      navigation: { shadow: '0 12px 32px -12px rgb(21 20 18 / 0.25), 0 2px 6px -2px rgb(21 20 18 / 0.08)' },
    },
    colorScheme: {
      light: {
        surface,
        primary: { color: '{surface.900}', contrastColor: '#ffffff', hoverColor: '{surface.800}', activeColor: '{surface.700}' },
        highlight: { background: '{surface.100}', focusBackground: '{surface.200}', color: '{surface.900}', focusColor: '{surface.950}' },
        formField: {
          background: '{surface.0}',
          borderColor: '{surface.300}',
          hoverBorderColor: '{surface.400}',
          focusBorderColor: '{blue.500}',
          color: '{surface.900}',
          placeholderColor: '{surface.500}',
          iconColor: '{surface.500}',
          shadow: '0 1px 2px 0 rgb(21 20 18 / 0.04)',
        },
        text: { color: '{surface.900}', hoverColor: '{surface.950}', mutedColor: '{surface.500}', hoverMutedColor: '{surface.600}' },
        content: { background: '{surface.0}', hoverBackground: '{surface.100}', borderColor: '{surface.200}', color: '{text.color}', hoverColor: '{text.hover.color}' },
      },
      dark: {
        surface,
        primary: { color: '{surface.50}', contrastColor: '{surface.950}', hoverColor: '{surface.200}', activeColor: '{surface.300}' },
        highlight: { background: '{surface.800}', focusBackground: '{surface.700}', color: '{surface.0}', focusColor: '{surface.0}' },
        formField: {
          background: '{surface.950}',
          borderColor: '{surface.700}',
          hoverBorderColor: '{surface.600}',
          focusBorderColor: '{blue.400}',
          color: '{surface.0}',
          placeholderColor: '{surface.500}',
          iconColor: '{surface.400}',
        },
        text: { color: '{surface.50}', hoverColor: '{surface.0}', mutedColor: '{surface.400}', hoverMutedColor: '{surface.300}' },
        content: { background: '{surface.900}', hoverBackground: '{surface.800}', borderColor: '{surface.800}', color: '{text.color}', hoverColor: '{text.hover.color}' },
      },
    },
  },
  components: {
    button: {
      root: { label: { fontWeight: '500' }, sm: { fontSize: '0.875rem', paddingX: '0.75rem', paddingY: '0.4rem' } },
    },
    tooltip: {
      root: { maxWidth: '18rem', padding: '0.4rem 0.6rem', borderRadius: '{border.radius.sm}' },
      colorScheme: { light: { root: { background: '{surface.900}', color: '{surface.0}' } }, dark: { root: { background: '{surface.100}', color: '{surface.950}' } } },
    },
    tag: {
      root: { fontSize: '0.75rem', fontWeight: '600', padding: '0.15rem 0.5rem', borderRadius: '999px' },
    },
    togglebutton: {
      root: { padding: '0.2rem', fontWeight: '500' },
      content: { checkedShadow: '0 1px 2px rgb(21 20 18 / 0.08), 0 0 0 1px rgb(21 20 18 / 0.04)' },
      colorScheme: {
        light: {
          root: { background: '{surface.100}', checkedBackground: '{surface.100}', hoverBackground: '{surface.100}', borderColor: '{surface.100}', color: '{surface.600}', hoverColor: '{surface.900}', checkedColor: '{surface.900}', checkedBorderColor: '{surface.100}' },
          content: { checkedBackground: '{surface.0}' },
        },
        dark: {
          root: { background: '{surface.800}', checkedBackground: '{surface.800}', hoverBackground: '{surface.800}', borderColor: '{surface.800}', color: '{surface.400}', hoverColor: '{surface.0}', checkedColor: '{surface.0}', checkedBorderColor: '{surface.800}' },
          content: { checkedBackground: '{surface.700}' },
        },
      },
    },
    toggleswitch: {
      colorScheme: { light: { root: { checkedBackground: '{surface.900}', checkedHoverBackground: '{surface.800}' } }, dark: { root: { checkedBackground: '{surface.100}', checkedHoverBackground: '{surface.0}' } } },
    },
    progressbar: {
      root: { height: '4px', borderRadius: '999px' },
      value: { background: '{blue.500}' },
    },
    toast: { root: { width: '24rem', borderRadius: '{border.radius.lg}' } },
    card: { root: { shadow: 'none', borderRadius: '{border.radius.xl}' } },
  },
});
