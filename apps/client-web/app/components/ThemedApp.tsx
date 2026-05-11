import CssBaseline from '@mui/material/CssBaseline';
import {ThemeProvider} from '@mui/material/styles';
import {useEffect, useMemo} from 'react';
import {useColorMode} from '../contexts/ColorModeContext';
import {createAppTheme} from '../theme';

export function ThemedApp({children}: {children: React.ReactNode}) {
  const {mode} = useColorMode();
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  // Set color-scheme on <html> so native browser elements (scrollbars, form controls)
  // respect the current theme mode
  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
