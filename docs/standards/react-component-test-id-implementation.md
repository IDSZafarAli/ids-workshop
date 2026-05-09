---
marp: true
theme: ids-training-marp-theme
header: 'React Component Test Id Implementation'
paginate: true
footer: '&copy; 2026 - Integrated Dealer Systems'
---
# Implementation Plan: Adding Data Test IDs to React Components

This document provides specific code changes needed to make your e2e tests robust and maintainable.

## Phase 1: Customer List Component Updates

### File: `/apps/client-web/app/routes/customers/index.tsx`

Add the following data-testid attributes to make testing more reliable:

```tsx
// Search input section
<TextField
  data-testid="customer-search-input"
  placeholder={t('search')}
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  sx={{width: 300}}
  InputProps={{
    startAdornment: (
      <InputAdornment position="start">
        <SearchIcon data-testid="search-icon" />
      </InputAdornment>
    ),
  }}
/>

// Table structure
<TableContainer data-testid="customers-table-container">
  <Table 
    sx={{minWidth: 650}} 
    aria-label="customers table"
    data-testid="customers-table"
  >
    <TableHead data-testid="customers-table-head">
      <TableRow>
        <TableCell data-testid="header-id">{t('customerList.id')}</TableCell>
        <TableCell data-testid="header-first-name">{t('customerList.firstName')}</TableCell>
        <TableCell data-testid="header-surname">{t('customerList.surname')}</TableCell>
        <TableCell data-testid="header-status">{t('customerList.status')}</TableCell>
        <TableCell data-testid="header-last-contact">{t('customerList.lastContact')}</TableCell>
        <TableCell data-testid="header-last-updated">{t('customerList.lastUpdated')}</TableCell>
      </TableRow>
    </TableHead>
    <TableBody data-testid="customers-table-body">
      {loading ? (
        <TableRow data-testid="loading-row">
          <TableCell colSpan={6} align="center" sx={{py: 10}}>
            <CircularProgress data-testid="customers-loading" />
          </TableCell>
        </TableRow>
      ) : customers.length === 0 ? (
        <TableRow data-testid="empty-row">
          <TableCell colSpan={6} align="center" sx={{py: 10}}>
            <Typography 
              variant="body1" 
              color="text.secondary"
              data-testid="customers-no-results"
            >
              {t('noResults')}
            </Typography>
          </TableCell>
        </TableRow>
      ) : (
        customers.map((customer) => (
          <TableRow
            key={customer.id}
            data-testid={`customer-row-${customer.id}`}
            hover
            onClick={() => handleRowClick(customer.id)}
            sx={{cursor: 'pointer', '&:hover': {backgroundColor: 'action.hover'}}}
          >
            <TableCell 
              data-testid={`customer-id-${customer.id}`}
              sx={{fontFamily: 'monospace', fontSize: '0.875rem'}}
            >
              {customer.id.substring(0, 8)}...
            </TableCell>
            <TableCell data-testid={`customer-first-name-${customer.id}`}>
              {customer.firstName}
            </TableCell>
            <TableCell data-testid={`customer-surname-${customer.id}`}>
              {customer.surname}
            </TableCell>
            <TableCell data-testid={`customer-status-${customer.id}`}>
              <Box
                component="span"
                data-testid={`customer-status-badge-${customer.id}`}
                sx={{
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1,
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  backgroundColor:
                    customer.status === 'active'
                      ? 'success.main'
                      : customer.status === 'inactive'
                        ? 'error.main'
                        : customer.status === 'prospect'
                          ? 'info.main'
                          : 'warning.main',
                  color: 'white',
                }}
              >
                {t(`status.${customer.status}`, customer.status)}
              </Box>
            </TableCell>
            <TableCell data-testid={`customer-last-contact-${customer.id}`}>
              {customer.lastContactDate
                ? new Date(customer.lastContactDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : t('never')}
            </TableCell>
            <TableCell data-testid={`customer-last-updated-${customer.id}`}>
              {customer.updatedDate
                ? new Date(customer.updatedDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : 'N/A'}
            </TableCell>
          </TableRow>
        ))
      )}
    </TableBody>
  </Table>
</TableContainer>

// Pagination
<TablePagination
  data-testid="customers-pagination"
  rowsPerPageOptions={[5, 10, 25, 50]}
  component="div"
  count={total}
  rowsPerPage={rowsPerPage}
  page={page}
  onPageChange={handleChangePage}
  onRowsPerPageChange={handleChangeRowsPerPage}
  aria-label="customers pagination navigation"
/>

// Error state
{error && (
  <Box sx={{p: 3}} data-testid="customers-error-container">
    <Alert severity="error" data-testid="customers-error">
      {error}
    </Alert>
  </Box>
)}
```
---
## Phase 2: Customer Details Component Updates

### File: `/apps/client-web/app/routes/customers/$id.tsx`

Add these data-testid attributes:

```tsx
// Loading state
{loading && (
  <Box 
    sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh'}}
    data-testid="customer-loading-container"
  >
    <CircularProgress data-testid="customer-loading" />
  </Box>
)}

// Error state
{(error || !customer) && (
  <Box sx={{p: 3}} data-testid="customer-error-container">
    <Alert severity="error" data-testid="customer-error">
      {error || t('customerNotFound')}
    </Alert>
    <Button 
      onClick={() => navigate('/customers')} 
      sx={{mt: 2}}
      data-testid="customer-error-back-button"
    >
      {t('backToCustomers')}
    </Button>
  </Box>
)}

// Header section
<Box 
  sx={{mb: 3, display: 'flex', alignItems: 'center', gap: 2}}
  data-testid="customer-header"
>
  <IconButton 
    onClick={() => navigate('/customers')} 
    data-testid="back-to-customers-button"
  >
    <ArrowBackIcon data-testid="back-arrow-icon" />
  </IconButton>
  <Typography 
    variant="h4" 
    component="h1"
    data-testid="customer-profile-heading"
  >
    {t('customerProfile')}
  </Typography>
</Box>

// Customer header card
<Card 
  sx={{mb: 3, background: 'linear-gradient(135deg, #DF4145 0%, #3C3938 100%)'}}
  data-testid="customer-header-card"
>
  <CardContent sx={{color: 'white', py: 4}}>
    <Typography 
      variant="h3" 
      component="h2" 
      gutterBottom
      data-testid="customer-name-display"
    >
      {customer.salutation ? `${customer.salutation} ` : ''}
      {customer.firstName} {customer.surname}
      {customer.suffix ? ` ${customer.suffix}` : ''}
    </Typography>
    {customer.entityName && (
      <Typography 
        variant="h6" 
        sx={{opacity: 0.9}}
        data-testid="customer-entity-name"
      >
        {customer.entityName}
      </Typography>
    )}
    <Box sx={{mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap'}}>
      <Chip
        data-testid="customer-status-chip"
        label={t(`status.${customer.status}`, customer.status.toUpperCase())}
        sx={{
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          color: 'white',
          '& .MuiChip-label': {
            fontWeight: 'bold',
          },
        }}
      />
      {customer.dealStatus && (
        <Chip
          data-testid="customer-deal-status-chip"
          label={customer.dealStatus.replace('_', ' ').toUpperCase()}
          sx={{
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            '& .MuiChip-label': {
              fontWeight: 'bold',
            },
          }}
        />
      )}
    </Box>
  </CardContent>
</Card>

// Contact information card
<Card sx={{mb: 3}} data-testid="customer-contact-card">
  <CardContent>
    <Typography 
      variant="h6" 
      gutterBottom
      data-testid="contact-info-heading"
    >
      {t('contactInformation')}
    </Typography>
    <Stack spacing={2}>
      {customer.email && (
        <Box 
          sx={{display: 'flex', alignItems: 'center', gap: 1}}
          data-testid="customer-email-section"
        >
          <EmailIcon 
            color="primary" 
            data-testid="email-icon" 
          />
          <Typography data-testid="customer-email-text">
            {customer.email}
          </Typography>
        </Box>
      )}
      
      {/* Primary address */}
      {customer.addresses?.find(addr => addr.isPrimary) && (
        <Box 
          sx={{display: 'flex', alignItems: 'flex-start', gap: 1}}
          data-testid="customer-address-section"
        >
          <LocationOnIcon 
            color="primary" 
            data-testid="location-icon" 
          />
          <Box>
            <Typography data-testid="customer-address-street">
              {getStreetLine(customer.addresses.find(addr => addr.isPrimary)!)}
            </Typography>
            <Typography data-testid="customer-address-city">
              {customer.addresses.find(addr => addr.isPrimary)?.city}, {' '}
              {customer.addresses.find(addr => addr.isPrimary)?.state} {' '}
              {customer.addresses.find(addr => addr.isPrimary)?.zipCode}
            </Typography>
          </Box>
        </Box>
      )}
      
      {/* Primary phone */}
      {customer.phones?.find(phone => phone.isPrimary) && (
        <Box 
          sx={{display: 'flex', alignItems: 'center', gap: 1}}
          data-testid="customer-phone-section"
        >
          <Typography data-testid="customer-phone-text">
            📞 {customer.phones.find(phone => phone.isPrimary)?.number}
          </Typography>
        </Box>
      )}
    </Stack>
  </CardContent>
</Card>

// Business details card  
<Card data-testid="customer-business-card">
  <CardContent>
    <Typography 
      variant="h6" 
      gutterBottom
      data-testid="business-details-heading"
    >
      {t('businessDetails')}
    </Typography>
    <Stack spacing={2}>
      {customer.creditLimit && (
        <Typography data-testid="customer-credit-limit">
          <strong>{t('creditLimit')}:</strong> ${customer.creditLimit.toLocaleString()}
        </Typography>
      )}
      {customer.salesRepId && (
        <Typography data-testid="customer-sales-rep">
          <strong>{t('salesRep')}:</strong> {customer.salesRepId}
        </Typography>
      )}
      {customer.followUpDate && (
        <Typography data-testid="customer-follow-up-date">
          <strong>{t('followUpDate')}:</strong> {' '}
          {new Date(customer.followUpDate).toLocaleDateString()}
        </Typography>
      )}
    </Stack>
  </CardContent>
</Card>
```
---
## Phase 3: Test Configuration Updates

### Update your test file to use the new selectors:

```typescript
// Replace the old fragile selectors with these robust ones:

// ❌ Old fragile approach:
await page.waitForSelector('table tbody tr', {timeout: 5000});
const firstRow = page.locator('table tbody tr').first();

// ✅ New robust approach:
await page.getByTestId('customers-table').waitFor({timeout: 5000});
const firstRow = page.getByTestId(/customer-row-/).first();

// ❌ Old fragile approach:
const pagination = page.locator('.MuiTablePagination-root');

// ✅ New robust approach:  
const pagination = page.getByTestId('customers-pagination');

// ❌ Old fragile approach:
const searchInput = page.getByPlaceholder(/search/i);

// ✅ New robust approach (even better):
const searchInput = page.getByTestId('customer-search-input');
```
---
## Phase 4: Accessibility Improvements

While adding test IDs, also improve accessibility:

### Add ARIA labels:
```tsx
// Table with proper labeling
<Table 
  sx={{minWidth: 650}} 
  aria-label="customers table"
  data-testid="customers-table"
>

// Pagination with proper navigation label
<TablePagination
  data-testid="customers-pagination"
  aria-label="customers pagination navigation"
  // ... other props
/>

// Search input with proper labeling
<TextField
  data-testid="customer-search-input"
  placeholder={t('search')}
  aria-label="Search customers by name, email, or company"
  // ... other props
/>
```
---
## Implementation Checklist

### Customer List Component:
- [ ] Add `data-testid="customer-search-input"` to search TextField
- [ ] Add `data-testid="customers-table"` to main Table
- [ ] Add `data-testid="customers-table-body"` to TableBody  
- [ ] Add `data-testid="customer-row-{id}"` to each TableRow
- [ ] Add `data-testid="customers-loading"` to loading CircularProgress
- [ ] Add `data-testid="customers-error"` to error Alert
- [ ] Add `data-testid="customers-no-results"` to empty state
- [ ] Add `data-testid="customers-pagination"` to TablePagination

### Customer Details Component:
- [ ] Add `data-testid="customer-loading"` to loading state
- [ ] Add `data-testid="customer-error"` to error Alert  
- [ ] Add `data-testid="customer-header-card"` to header Card
- [ ] Add `data-testid="customer-name-display"` to name Typography
- [ ] Add `data-testid="customer-contact-card"` to contact Card
- [ ] Add `data-testid="customer-email-section"` to email section
- [ ] Add `data-testid="email-icon"` to EmailIcon
- [ ] Add `data-testid="customer-business-card"` to business details Card

---
### Test Updates:
- [ ] Replace all CSS class selectors with test IDs
- [ ] Replace generic element selectors with semantic ones
- [ ] Add proper wait conditions using `waitFor()`
- [ ] Use ARIA roles where appropriate
- [ ] Test error and loading states explicitly

---
## Benefits After Implementation

1. **More Reliable Tests**: Tests won't break when CSS classes change
2. **Better Accessibility**: Proper ARIA labels improve screen reader support
3. **Easier Debugging**: Clear test IDs make it easy to identify elements
4. **International Ready**: Less reliance on text content
5. **Maintainable**: Tests focus on user interactions, not implementation details

## Testing the Changes

After implementing these changes, run your tests to verify:

```bash
# Run the improved tests
npm run test:e2e

# Run specific customer tests
npx playwright test customer-pages-improved.spec.ts

# Run in headed mode for visual debugging
npx playwright test customer-pages-improved.spec.ts --headed
```

The improved tests should be much more stable and provide better error messages when they do fail.