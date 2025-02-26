import React, {
  cloneElement,
  Children,
  forwardRef,
  useContext,
  useMemo,
  useState,
} from 'react';

import { ThemeContext } from 'styled-components';
import {
  backgroundAndTextColors,
  colorIsDark,
  normalizeBackground,
  normalizeColor,
} from '../../utils';
import { defaultProps } from '../../default-props';
import { ButtonPropTypes } from './propTypes';

import { Box } from '../Box';
import { Tip } from '../Tip';

import { Badge } from './Badge';
import { StyledButton } from './StyledButton';
import { StyledButtonKind } from './StyledButtonKind';

// We have two Styled* components to separate
// the newer default|primary|secondary approach,
// which we use the term "kind" to refer to,
// from the previous approach. Hopefully, when we get to grommet v3,
// we can drop the old way and just use kind.
//
// In the kind approach, we rely on the basic structure of the theme
// being repeated. For example: button.default, button.active,
// button.active.default all refer to a similar object containing
// { background, border, color, padding }.
// This allows us to use the same code to evaluate color and generate CSS.
// We just need to build up CSS, since selectors override previous ones.
// See StyledButtonKind.kindStyles() for this.
// And we build down to determine icon color, once we have a color from
// the latest applicable state, we can stop. See Button.getIconColor() for this.
// backgroundAndTextColor() is used in both cases to ensure we are determining
// color in the same way, so the icon and label align.

// only when default is in the theme
// Used to get the color for the icon to match what StyledButtonKind
// and backgroundStyle() will do for the label.
// The paths are ordered from basic to specific. Go through them
// specific to base until we find one that has a color and use that.
const getIconColor = (paths = [], theme, colorProp, kind) => {
  let result = [];
  let index = paths.length - 1;
  // caller has specified a themeObj to use for styling
  // relevant for cases like pagination which looks to theme.pagination.button
  if (typeof kind === 'object') index = 0;
  // stop when we have a color or no more paths
  while (index >= 0 && !result[1]) {
    let obj = (typeof kind === 'object' && kind) || theme.button;
    // find the sub-object under the button them that corresponds with this path
    // for example: 'active.primary'
    if (paths[index]) {
      const parts = paths[index].split('.');
      while (obj && parts.length) obj = obj[parts.shift()];
    }

    if (obj) {
      // use passed in color for background if the theme has a background color
      const background =
        colorProp && obj.background && obj.background.color
          ? colorProp
          : obj.background;

      // if theme object explicitly sets the color to undefined, pass false
      // to indicate that the theme doesn't want any text color
      const objColor =
        obj.color ||
        (Object.prototype.hasOwnProperty.call(obj, 'color') &&
        obj.color === undefined
          ? false
          : undefined);
      // use passed in color for text if the theme doesn't have
      // background or border color
      const color =
        colorProp &&
        (!obj.background || !obj.background.color) &&
        (!obj.border || !obj.border.color)
          ? colorProp
          : objColor;

      result = backgroundAndTextColors(background, color, theme);
    }
    index -= 1;
  }
  return result[1] || undefined;
};

const getPropertyColor = (property, paths = [], theme, kind, primary) => {
  let result;
  if (kind) {
    let obj = (typeof kind === 'object' && kind) || theme.button;
    // index 0 is default state
    if (paths[0]) {
      const parts = paths[0].split('.');
      while (obj && parts.length) obj = obj[parts.shift()];
    }
    if (obj) {
      result = obj[property] || (obj[property] && obj[property].color);
    }
  } else if (primary && theme && theme.button && theme.button.primary) {
    result =
      theme.button.primary[property] ||
      (theme.button.primary[property] && theme.button.primary[property].color);
  } else {
    result =
      (theme && theme.button && theme.button[property]) ||
      (theme &&
        theme.button &&
        theme.button[property] &&
        theme.button[property].color);
  }
  return result;
};

const Button = forwardRef(
  (
    {
      active,
      align = 'center',
      'aria-label': ariaLabel,
      badge: badgeProp,
      color, // munged to avoid styled-components putting it in the DOM
      children,
      disabled,
      icon,
      focusIndicator = true,
      gap,
      fill, // munged to avoid styled-components putting it in the DOM
      href,
      justify,
      kind: kindArg,
      label,
      onBlur,
      onClick,
      onFocus,
      onMouseOut,
      onMouseOver,
      plain,
      primary,
      reverse,
      secondary,
      selected,
      size,
      tip,
      type = 'button',
      // can't alphabetize a11yTitle before tip is defined
      a11yTitle = typeof tip === 'string' ? tip : undefined,
      as,
      ...rest
    },
    ref,
  ) => {
    const theme = useContext(ThemeContext) || defaultProps.theme;
    const [focus, setFocus] = useState();
    const [hover, setHover] = useState(false);

    if ((icon || label) && children) {
      console.warn(
        'Button should not have children if icon or label is provided',
      );
    }

    // kindArg is object if we are referencing a theme object
    // outside of theme.button
    const kindObj = useMemo(() => typeof kindArg === 'object', [kindArg]);

    // if the theme has button.default, what kind of Button is this
    const kind = useMemo(() => {
      if (theme.button.default || kindObj) {
        if (kindArg) return kindArg;
        if (primary) return 'primary';
        if (secondary) return 'secondary';
        return 'default';
      }
      return undefined; // pre-default, no kind
    }, [kindArg, kindObj, primary, secondary, theme]);

    // When we have a kind and are not plain, themePaths stores the relative
    // paths within the theme for the current kind and state of the button.
    // These paths are used with getIconColor() above and kindStyle() within
    // StyledButtonKind.
    const themePaths = useMemo(() => {
      if (!kind || plain) return undefined;
      const result = { base: [], hover: [] };
      if (!kindObj) result.base.push(kind);
      if (selected) {
        result.base.push('selected');
        if (!kindObj) result.base.push(`selected.${kind}`);
      }
      if (disabled) {
        result.base.push('disabled');
        if (!kindObj) result.base.push(`disabled.${kind}`);
      } else {
        if (active) {
          result.base.push('active');
          if (!kindObj) result.base.push(`active.${kind}`);
        }
        result.hover.push('hover');
        if (!kindObj) result.hover.push(`hover.${kind}`);
        if (active) {
          result.hover.push(`hover.active`);
          if (!kindObj) {
            result.hover.push(`hover.active.${kind}`);
          }
        }
      }
      return result;
    }, [active, disabled, kind, kindObj, plain, selected]);

    // only used when theme does not have button.default
    const isDarkBackground = () => {
      const backgroundColor = normalizeBackground(
        normalizeColor(
          color ||
            (theme.button.primary && theme.button.primary.color) ||
            theme.global.colors.control ||
            'brand',
          theme,
        ),
        theme,
      );

      return colorIsDark(backgroundColor, theme);
    };

    const onMouseOverButton = (event) => {
      setHover(true);
      if (onMouseOver) {
        onMouseOver(event);
      }
    };

    const onMouseOutButton = (event) => {
      setHover(false);
      if (onMouseOut) {
        onMouseOut(event);
      }
    };

    let buttonIcon = icon;
    // only change color if user did not specify the color themselves...
    if (icon && !icon.props.color) {
      if (kind) {
        if (!plain) {
          // match what the label will use
          const iconColor =
            (hover && getIconColor(themePaths.hover, theme)) ||
            getIconColor(themePaths.base, theme, color, kind);
          if (iconColor) buttonIcon = cloneElement(icon, { color: iconColor });
        }
      } else if (primary) {
        buttonIcon = cloneElement(icon, {
          color:
            theme.global.colors.text[isDarkBackground() ? 'dark' : 'light'],
        });
      }
    }

    const domTag = !as && href ? 'a' : as;
    const first = reverse ? label : buttonIcon;
    const second = reverse ? buttonIcon : label;

    let contents;
    if (first && second) {
      contents = (
        <Box
          direction="row"
          align="center"
          justify={justify || (align === 'center' ? 'center' : 'between')}
          gap={gap || theme.button.gap}
          responsive={false}
        >
          {first}
          {second}
        </Box>
      );
    } else if (typeof children === 'function') {
      contents = children({ disabled, hover, focus });
    } else {
      contents = first || second || children;
    }

    const background = getPropertyColor(
      'background',
      themePaths && themePaths.base,
      theme,
      kind,
      primary,
    );
    const border = getPropertyColor(
      'border',
      themePaths && themePaths.base,
      theme,
      kind,
      primary,
    );
    // set the badge relative to the button content
    // when the button doesn't have background or border
    // (!kind && icon && !label) is necessary because for old button logic,
    // if button has icon but not label, it will be considered "plain",
    // so no border or background will be applied
    const innerBadge = (!background && !border) || (!kind && icon && !label);
    if (badgeProp && innerBadge) {
      contents = <Badge content={badgeProp}>{contents}</Badge>;
    }

    let styledButtonResult;
    if (kind) {
      styledButtonResult = (
        <StyledButtonKind
          {...rest}
          as={domTag}
          ref={ref}
          active={active}
          align={align}
          aria-label={ariaLabel || a11yTitle}
          badge={badgeProp}
          colorValue={color}
          disabled={disabled}
          hasIcon={!!icon}
          gap={gap}
          hasLabel={!!label}
          icon={icon}
          fillContainer={fill}
          focus={focus}
          focusIndicator={focusIndicator}
          href={href}
          kind={kind}
          themePaths={themePaths}
          onClick={onClick}
          onFocus={(event) => {
            setFocus(true);
            if (onFocus) onFocus(event);
          }}
          onBlur={(event) => {
            setFocus(false);
            if (onBlur) onBlur(event);
          }}
          onMouseOver={onMouseOverButton}
          onMouseOut={onMouseOutButton}
          plain={plain || Children.count(children) > 0}
          primary={primary}
          sizeProp={size}
          type={!href ? type : undefined}
        >
          {contents}
        </StyledButtonKind>
      );
    } else {
      styledButtonResult = (
        <StyledButton
          {...rest}
          as={domTag}
          ref={ref}
          aria-label={ariaLabel || a11yTitle}
          colorValue={color}
          active={active}
          selected={selected}
          disabled={disabled}
          hasIcon={!!icon}
          gap={gap}
          hasLabel={!!label}
          fillContainer={fill}
          focus={focus}
          focusIndicator={focusIndicator}
          href={href}
          kind={kind}
          themePaths={themePaths}
          onClick={onClick}
          onFocus={(event) => {
            setFocus(true);
            if (onFocus) onFocus(event);
          }}
          onBlur={(event) => {
            setFocus(false);
            if (onBlur) onBlur(event);
          }}
          onMouseOver={onMouseOverButton}
          onMouseOut={onMouseOutButton}
          pad={!plain}
          plain={
            typeof plain !== 'undefined'
              ? plain
              : Children.count(children) > 0 || (icon && !label)
          }
          primary={primary}
          sizeProp={size}
          type={!href ? type : undefined}
        >
          {contents}
        </StyledButton>
      );
    }
    if (tip) {
      if (typeof tip === 'string') {
        styledButtonResult = <Tip content={tip}>{styledButtonResult}</Tip>;
      } else {
        styledButtonResult = <Tip {...tip}>{styledButtonResult}</Tip>;
      }
    }

    // if button has background or border, place badge relative
    // to outer edge of button
    if (badgeProp && !innerBadge) {
      styledButtonResult = (
        <Badge content={badgeProp}>{styledButtonResult}</Badge>
      );
    }
    return styledButtonResult;
  },
);

Button.displayName = 'Button';
Button.propTypes = ButtonPropTypes;

export { Button };
