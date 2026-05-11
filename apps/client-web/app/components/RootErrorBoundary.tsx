import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import {ThemeProvider} from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {isRouteErrorResponse, useRouteError} from 'react-router';
import {createAppTheme} from '../theme';

export function RootErrorBoundary() {
  const error = useRouteError();
  let title = 'Something went wrong';
  let detail = 'An unexpected error occurred.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    detail = error.data?.toString() ?? 'No details available.';
  } else if (error instanceof Error) {
    detail = error.message;
  }

  const theme = createAppTheme('light');

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          p: 4,
          textAlign: 'center',
        }}
      >
        <ErrorOutlineIcon sx={{fontSize: 64, color: 'error.main', mb: 2}} />
        <Typography variant="h5" gutterBottom>
          {title}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{mb: 3, maxWidth: 480}}>
          {detail}
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </Box>
    </ThemeProvider>
  );
}
