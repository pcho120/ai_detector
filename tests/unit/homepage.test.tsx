import React from 'react';
import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

describe('HomePage', () => {
  it('renders the upload shell', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: /ai detect essay review/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload essay file/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });
});
