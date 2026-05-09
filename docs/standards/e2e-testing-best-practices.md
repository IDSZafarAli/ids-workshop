---
marp: true
theme: ids-training-marp-theme
header: 'E2E Testing Best Practices'
paginate: true
footer: '&copy; 2026 - Integrated Dealer Systems'
---
# E2E Testing Best Practices for React + Material UI

> **Tactical patterns for Claude live in `.claude/skills/playwright-e2e/`.** When a rule below changes, mirror the change in that SKILL.md so Claude's auto-loaded context stays in sync.

## Overview
This guide outlines best practices for creating robust, maintainable e2e tests for React applications using Material UI components.

## Core Principles

### 1. **Use Data Test IDs as Primary Strategy**
- Add `data-testid` attributes to all testable elements
- Use semantic, descriptive names
- Avoid CSS classes and implementation details

### 2. **Leverage ARIA Roles and Labels**  
- Use `getByRole()` with accessible names
- Test accessibility and functionality together
- Works well with screen readers

---

### 3. **Avoid Fragile Selectors**
- Don't use CSS classes (especially MUI auto-generated ones)
- Don't rely on DOM structure (`tbody tr:first-child`)
- Don't use text content for non-content assertions

### 4. **Make Tests Internationalization-Ready**
- Use data attributes instead of text content
- When testing text, use specific test content or IDs

---

## Implementation Strategy

### Customer List Page Improvements

#### Add Data Test IDs to Components:
```tsx
// apps/client-web/app/routes/customers/index.tsx

// Search input
<TextField
  data-testid="customer-search-input"
  placeholder={t('search')}
  // ...rest of props
/>

// Table
<Table data-testid="customers-table">
  <TableHead>
    <TableRow>
      <TableCell data-testid="header-id">{t('customerList.id')}</TableCell>
      <TableCell data-testid="header-name">{t('customerList.firstName')}</TableCell>
      // ... other headers
    </TableRow>
  </TableHead>
  <TableBody data-testid="customers-table-body">
    {customers.map((customer) => (
      <TableRow 
        key={customer.id}
        data-testid={`customer-row-${customer.id}`}
        onClick={() => handleRowClick(customer.id)}
      >
        <TableCell data-testid={`customer-id-${customer.id}`}>
          {customer.id.substring(0, 8)}...
        </TableCell>
        <TableCell data-testid={`customer-name-${customer.id}`}>
          {customer.firstName} {customer.surname}
        </TableCell>
        // ... other cells
      </TableRow>
    ))}
  </TableBody>
</Table>

// Pagination
<TablePagination
  data-testid="customers-pagination"
  rowsPerPageOptions={[5, 10, 25, 50]}
  // ... other props
/>

// Loading state
<CircularProgress data-testid="customers-loading" />

// Error alert
<Alert data-testid="customers-error" severity="error">
  {error}
</Alert>

// No results
<Typography data-testid="customers-no-results">
  {t('noResults')}
</Typography>
```
---

#### Updated Test Patterns:
```typescript
// Instead of fragile selectors:
❌ page.locator('table tbody tr')
❌ page.locator('.MuiTablePagination-root')
❌ page.getByText(/customers/i)

// Use robust selectors:
✅ page.getByTestId('customers-table-body')
✅ page.getByTestId('customers-pagination')
✅ page.getByRole('heading', {name: 'Customers'})
✅ page.getByTestId('customer-search-input')
```
---

### Customer Details Page Improvements

#### Add Data Test IDs:
```tsx
// apps/client-web/app/routes/customers/$id.tsx

// Back button (already has testid - good!)
<IconButton data-testid="back-to-customers-button">

// Customer profile section
<Card data-testid="customer-header-card">
  <Typography data-testid="customer-name">
    {customer.firstName} {customer.surname}
  </Typography>
  <Typography data-testid="customer-entity">
    {customer.entityName}
  </Typography>
  <Chip 
    data-testid="customer-status"
    label={t(`status.${customer.status}`)}
  />
</Card>

// Contact information
<Card data-testid="customer-contact-card">
  <Box data-testid="customer-email">
    <EmailIcon data-testid="email-icon" />
    <Typography data-testid="email-text">{email}</Typography>
  </Box>
</Card>

// Loading/Error states
<CircularProgress data-testid="customer-loading" />
<Alert data-testid="customer-error">{error}</Alert>
```
---

## Test Selector Hierarchy

### Priority Order (Most → Least Robust):

1. **`data-testid` attributes** - Most reliable
   ```typescript
   page.getByTestId('customer-search-input')
   ```

2. **ARIA roles with accessible names** - Accessibility + Testing
   ```typescript
   page.getByRole('button', {name: 'Search customers'})
   page.getByRole('table', {name: 'customers table'})
   ```

3. **Form labels and placeholders** - Semantic meaning
   ```typescript
   page.getByPlaceholder('Search customers...')
   page.getByLabel('Customer status')
   ```

4. **Text content (when specific)** - Content testing
   ```typescript
   page.getByText('No customers found') // Specific empty state
   ```
---

5. **Generic element selectors** - Last resort only
   ```typescript
   page.locator('table') // Only if unique and stable
   ```

### ❌ Avoid These Selectors:
- CSS classes: `.MuiTablePagination-root`
- DOM structure: `table tbody tr:first-child`
- Implementation details: `[class*="MuiCard"]`
- Position-based: `.first()`, `.nth()`
- Generic text: `getByText(/customers/i)`

---

## Updated Test Examples

### Robust Customer List Tests:
```typescript
test('should display customer list with data', async ({page}) => {
  await page.goto('/customers');
  
  // Wait for table to load
  await page.getByTestId('customers-table').waitFor();
  
  // Verify table structure
  await expect(page.getByTestId('customers-table')).toBeVisible();
  await expect(page.getByTestId('header-id')).toBeVisible();
  await expect(page.getByTestId('header-name')).toBeVisible();
  
  // Verify at least one customer row exists
  const customerRows = page.getByTestId(/customer-row-/);
  await expect(customerRows.first()).toBeVisible();
});

test('should search customers', async ({page}) => {
  await page.goto('/customers');
  
  // Wait for initial load
  await page.getByTestId('customers-table').waitFor();
  
  // Count initial rows
  const initialCount = await page.getByTestId(/customer-row-/).count();
  
  // Search for specific term
  await page.getByTestId('customer-search-input').fill('Peterson');
  
  // Wait for search results (debounced)
  await page.waitForTimeout(600);
  
  // Verify filtering worked
  const filteredCount = await page.getByTestId(/customer-row-/).count();
  expect(filteredCount).toBeLessThanOrEqual(initialCount);
});

test('should navigate to customer details', async ({page}) => {
  await page.goto('/customers');
  
  // Wait for customers to load
  await page.getByTestId('customers-table').waitFor();
  
  // Click first customer row
  const firstCustomerRow = page.getByTestId(/customer-row-/).first();
  await firstCustomerRow.click();
  
  // Should navigate to details page
  await expect(page).toHaveURL(/\/customers\/[a-z0-9-]+/);
  await expect(page.getByTestId('customer-header-card')).toBeVisible();
});

test('should handle loading state', async ({page}) => {
  // Intercept API to delay response
  await page.route('**/api/customer*', async (route) => {
    await page.waitForTimeout(1000); // Simulate slow API
    return route.continue();
  });
  
  await page.goto('/customers');
  
  // Should show loading indicator
  await expect(page.getByTestId('customers-loading')).toBeVisible();
  
  // Should eventually show table
  await expect(page.getByTestId('customers-table')).toBeVisible();
  await expect(page.getByTestId('customers-loading')).not.toBeVisible();
});

test('should handle error state', async ({page}) => {
  // Mock API failure
  await page.route('**/api/customer*', (route) => 
    route.fulfill({status: 500, body: 'Server Error'})
  );
  
  await page.goto('/customers');
  
  // Should show error message
  await expect(page.getByTestId('customers-error')).toBeVisible();
  await expect(page.getByTestId('customers-table')).not.toBeVisible();
});
```

### Robust Pagination Tests:
```typescript
test('should change rows per page', async ({page}) => {
  await page.goto('/customers');
  await page.getByTestId('customers-table').waitFor();
  
  // Find pagination component
  const pagination = page.getByTestId('customers-pagination');
  
  // Change rows per page using ARIA role
  await pagination.getByRole('combobox', {name: /rows per page/i}).click();
  await page.getByRole('option', {name: '25'}).click();
  
  // Verify the change took effect (check URL params or re-count)
  await expect(page).toHaveURL(/pageSize=25/);
});
```
---

## Material UI Specific Patterns

### TablePagination Component:
```typescript
// ✅ Good - Use semantic roles
const pagination = page.getByTestId('customers-pagination');
await pagination.getByRole('combobox').click(); // Rows per page
await pagination.getByRole('button', {name: 'Next page'}).click();

// ❌ Bad - Fragile CSS classes
page.locator('.MuiTablePagination-selectLabel')
```

### TextField Component:
```typescript
// ✅ Good - Use test IDs and labels
await page.getByTestId('customer-search-input').fill('search term');
await page.getByLabel('Customer Name').fill('John');

// ❌ Bad - Generic selectors
page.getByRole('textbox').first()
```
---

### Card Components:
```typescript
// ✅ Good - Specific test IDs
await expect(page.getByTestId('customer-contact-card')).toBeVisible();

// ❌ Bad - CSS class matching
page.locator('[class*="MuiCard"]')
```
---

## Implementation Checklist

### For Components:
- [ ] Add `data-testid` to all interactive elements
- [ ] Add `data-testid` to containers and sections  
- [ ] Add `data-testid` to loading/error states
- [ ] Use semantic ARIA labels where appropriate
- [ ] Include unique identifiers in test IDs (like customer IDs)

### For Tests:
- [ ] Replace CSS class selectors with test IDs
- [ ] Replace generic element selectors with specific ones
- [ ] Use `waitFor()` instead of `waitForTimeout()` when possible
- [ ] Test user journeys, not implementation details
- [ ] Include accessibility testing via roles
- [ ] Test error and loading states explicitly

---

### Performance:
- [ ] Use `page.waitFor()` for elements that load asynchronously
- [ ] Avoid unnecessary `waitForTimeout()` calls — **exception: auth/token propagation waits that have no reactive signal (see below)**
- [ ] Use efficient selectors (test IDs > roles > text)
- [ ] Test with realistic data volumes

---

## `waitForTimeout` — Justified vs. Unjustified

The general rule is to avoid `waitForTimeout` in favour of reactive waits (`waitFor`, `waitForURL`, `expect(locator).toBeVisible()`). However, there is one justified exception:

**Infrastructure-level auth token propagation** — after switching location, Logto's organization-scoped token refresh is an external async process with no DOM signal, no network response to intercept, and no `aria-busy` to poll. A fixed wait is the only reliable mechanism. This wait **must** include a comment explaining why:

```typescript
// Additional buffer so organization-scoped token refresh can settle in context.
await page.waitForTimeout(8000);
```

Do not remove or reduce this wait without explicit instruction. Any other use of `waitForTimeout` in test interaction flows is unjustified and should be replaced with a reactive wait.

---

## Multi-Tenant Testing Rules

This application is multi-tenant — every entity is scoped to a `locationId`. Tests must be written with this in mind.

### Location selection

Always select the test location based on available seed data, not convenience. Check `database/seeds/data/` before writing any test that asserts on fetched data:

```typescript
// ✅ Correct — explicitly pick a location that has the required seed data
await selectLocation(sharedPage, 'LOC_HQ'); // LOC_HQ has customers, parts, units

// ❌ Wrong — assume the default location has data
// (omitting selectLocation and hoping it works)
```

### Seed data contract

Before writing a test that depends on remotely fetched data:

1. Check `database/seeds/data/` for the entity type your feature uses
2. Verify at least one active location has seed records for that entity
3. If no location has data, **add seed data** for that entity first — do not write a test that relies on data that doesn't exist

### Seeding gap vs. legitimate empty state

These are different and must be handled differently:

| Situation | What it is | What to do |
|---|---|---|
| Dropdown shows nothing because `LOC_CCC` has no customers seeded | **Seeding gap** | Add customers for `LOC_CCC` to seed data; test the opener state |
| Optional field shows empty because user hasn't selected anything | **Legitimate empty state** | Test this state explicitly — it is valid UI, not a bug |

Never gate a test by asserting "data must exist" for optional fields. The empty state is valid and must be tested separately from the populated state.

---

## Remote-Data Field Testing (Autocomplete, Select)

Any field that loads data from an API (Autocomplete, Select with remote options) must cover **three states**, not just the search path:

### State 1 — Opener state (most commonly missed)
```typescript
// ✅ Test that opening the field without typing shows options
const sellerInput = sharedPage.getByPlaceholder('Seller #');
await sellerInput.click(); // open without typing
const firstOption = sharedPage.getByRole('option').first();
await expect(firstOption).toBeVisible({timeout: 5_000});
```

### State 2 — Search state
```typescript
// ✅ Test that typing filters the options
await sellerInput.fill('Pacific');
const filteredOption = sharedPage.getByRole('option', {name: /Pacific/i});
await expect(filteredOption).toBeVisible({timeout: 5_000});
```

### State 3 — Not-found state
```typescript
// ✅ Test that a non-existent search term shows empty state gracefully
await sellerInput.fill('ZZZNOMATCH99999');
await sharedPage.waitForTimeout(600); // debounce
const noOptions = sharedPage.getByText('No options');
await expect(noOptions).toBeVisible({timeout: 3_000});
// Verify no crash — disabled name field still empty
const nameField = sharedPage.getByPlaceholder('Seller name');
await expect(nameField).toHaveValue('');
```

Tests that only cover State 2 (search) can pass even when the dropdown is empty by default, masking a seeding gap. Always write all three states.

---

## E2E Script Usage

Always use the correct script to avoid picking up Vitest unit tests from the monorepo root:

| Command | When to use |
|---|---|
| `npm run e2e:all:ci` | Full suite — final gate |
| `cd apps/client-web-e2e && npx playwright test --project=chromium <file>` | Single file during repair loop |

**Never** run `npx playwright test --config=...` from the repo root during repair — it picks up all `*.test.ts` files across the monorepo, including Vitest unit tests, making runs 10× slower.

---

## Migration Strategy

### Phase 1: Critical Components
1. Add test IDs to customer list table
2. Add test IDs to search functionality  
3. Add test IDs to pagination
4. Update corresponding tests

### Phase 2: Customer Details
1. Add test IDs to customer detail cards
2. Add test IDs to contact information
3. Add test IDs to action buttons
4. Update detail page tests

### Phase 3: Error Handling
1. Add test IDs to error states
2. Add test IDs to loading states  
3. Add test IDs to empty states
4. Update error handling tests

This approach will make your tests much more reliable and maintainable while also improving the accessibility of your application.