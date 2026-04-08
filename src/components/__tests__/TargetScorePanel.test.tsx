import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TargetScorePanel } from '../TargetScorePanel';
import type { TargetScorePanelProps } from '../TargetScorePanel';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeProps(overrides: Partial<TargetScorePanelProps> = {}): TargetScorePanelProps {
  return {
    targetScore: '80',
    onTargetScoreChange: vi.fn(),
    onRewrite: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    disabled: false,
    progress: null,
    result: null,
    ...overrides,
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

describe('TargetScorePanel – required test IDs', () => {
  it('renders data-testid="target-score-panel"', () => {
    render(<TargetScorePanel {...makeProps()} />);
    expect(screen.getByTestId('target-score-panel')).toBeInTheDocument();
  });

  it('renders data-testid="target-score-input"', () => {
    render(<TargetScorePanel {...makeProps()} />);
    expect(screen.getByTestId('target-score-input')).toBeInTheDocument();
  });

  it('renders data-testid="bulk-rewrite-btn"', () => {
    render(<TargetScorePanel {...makeProps()} />);
    expect(screen.getByTestId('bulk-rewrite-btn')).toBeInTheDocument();
  });

  it('does NOT render bulk-progress-bar when isLoading=false', () => {
    render(<TargetScorePanel {...makeProps({ isLoading: false, progress: null })} />);
    expect(screen.queryByTestId('bulk-progress-bar')).not.toBeInTheDocument();
  });

  it('does NOT render bulk-result-message when result=null', () => {
    render(<TargetScorePanel {...makeProps({ result: null })} />);
    expect(screen.queryByTestId('bulk-result-message')).not.toBeInTheDocument();
  });
});

// ── Min / max validation ─────────────────────────────────────────────────────

describe('TargetScorePanel – min/max validation', () => {
  it('shows error when targetScore < 10', () => {
    render(<TargetScorePanel {...makeProps({ targetScore: '5' })} />);
    expect(screen.getByText(/minimum target is 10/i)).toBeInTheDocument();
  });

  it('shows error when targetScore > 100', () => {
    render(<TargetScorePanel {...makeProps({ targetScore: '110' })} />);
    expect(screen.getByText(/maximum target is 100/i)).toBeInTheDocument();
  });

  it('shows error when targetScore is not a number', () => {
    render(<TargetScorePanel {...makeProps({ targetScore: 'abc' })} />);
    expect(screen.getByText(/valid number/i)).toBeInTheDocument();
  });

  it('shows no error for valid targetScore within range', () => {
    render(<TargetScorePanel {...makeProps({ targetScore: '50' })} />);
    expect(screen.queryByText(/minimum target/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/maximum target/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/valid number/i)).not.toBeInTheDocument();
  });

  it('shows no error for targetScore = 10 (boundary)', () => {
    render(<TargetScorePanel {...makeProps({ targetScore: '10' })} />);
    expect(screen.queryByText(/minimum target/i)).not.toBeInTheDocument();
  });

  it('shows no error for targetScore = 100 (boundary)', () => {
    render(<TargetScorePanel {...makeProps({ targetScore: '100' })} />);
    expect(screen.queryByText(/maximum target/i)).not.toBeInTheDocument();
  });

  it('shows no error when targetScore is empty string (pristine state)', () => {
    render(<TargetScorePanel {...makeProps({ targetScore: '' })} />);
    expect(screen.queryByText(/minimum target/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/maximum target/i)).not.toBeInTheDocument();
  });
});

// ── Disabled behavior ────────────────────────────────────────────────────────

describe('TargetScorePanel – disabled behavior', () => {
  it('disables the input when disabled=true', () => {
    render(<TargetScorePanel {...makeProps({ disabled: true })} />);
    expect(screen.getByTestId('target-score-input')).toBeDisabled();
  });

  it('disables the input when isLoading=true', () => {
    render(<TargetScorePanel {...makeProps({ isLoading: true })} />);
    expect(screen.getByTestId('target-score-input')).toBeDisabled();
  });

  it('disables the button when disabled=true', () => {
    render(<TargetScorePanel {...makeProps({ disabled: true })} />);
    expect(screen.getByTestId('bulk-rewrite-btn')).toBeDisabled();
  });

  it('disables the button when isLoading=true', () => {
    render(<TargetScorePanel {...makeProps({ isLoading: true })} />);
    expect(screen.getByTestId('bulk-rewrite-btn')).toBeDisabled();
  });

  it('disables the button when targetScore is empty (not valid)', () => {
    render(<TargetScorePanel {...makeProps({ targetScore: '' })} />);
    expect(screen.getByTestId('bulk-rewrite-btn')).toBeDisabled();
  });

  it('disables the button when targetScore is invalid (below min)', () => {
    render(<TargetScorePanel {...makeProps({ targetScore: '5' })} />);
    expect(screen.getByTestId('bulk-rewrite-btn')).toBeDisabled();
  });

  it('enables the button when valid score and not loading/disabled', () => {
    render(<TargetScorePanel {...makeProps({ targetScore: '60', disabled: false, isLoading: false })} />);
    expect(screen.getByTestId('bulk-rewrite-btn')).not.toBeDisabled();
  });

  it('shows "Rewriting..." label on button when isLoading=true', () => {
    render(<TargetScorePanel {...makeProps({ isLoading: true, targetScore: '60' })} />);
    expect(screen.getByTestId('bulk-rewrite-btn')).toHaveTextContent('Rewriting...');
  });

  it('shows "Rewrite to Target" label on button when not loading', () => {
    render(<TargetScorePanel {...makeProps({ isLoading: false, targetScore: '60' })} />);
    expect(screen.getByTestId('bulk-rewrite-btn')).toHaveTextContent('Rewrite to Target');
  });
});

// ── Input interaction ────────────────────────────────────────────────────────

describe('TargetScorePanel – input interaction', () => {
  it('calls onTargetScoreChange when input value changes', () => {
    const onTargetScoreChange = vi.fn();
    render(<TargetScorePanel {...makeProps({ onTargetScoreChange })} />);

    fireEvent.change(screen.getByTestId('target-score-input'), { target: { value: '70' } });

    expect(onTargetScoreChange).toHaveBeenCalledWith('70');
  });

  it('calls onRewrite with parsed integer when button is clicked', () => {
    const onRewrite = vi.fn().mockResolvedValue(undefined);
    render(<TargetScorePanel {...makeProps({ targetScore: '75', onRewrite })} />);

    fireEvent.click(screen.getByTestId('bulk-rewrite-btn'));

    expect(onRewrite).toHaveBeenCalledWith(75);
  });
});

// ── Progress rendering ───────────────────────────────────────────────────────

describe('TargetScorePanel – progress rendering', () => {
  it('renders bulk-progress-bar when isLoading=true and progress is provided', () => {
    render(
      <TargetScorePanel
        {...makeProps({
          isLoading: true,
          progress: { current: 3, total: 5, phase: 'rewriting' },
        })}
      />,
    );
    expect(screen.getByTestId('bulk-progress-bar')).toBeInTheDocument();
  });

  it('displays correct sentence count text during rewriting', () => {
    render(
      <TargetScorePanel
        {...makeProps({
          isLoading: true,
          progress: { current: 2, total: 4, phase: 'rewriting' },
        })}
      />,
    );
    expect(screen.getByText(/rewriting 2\/4 sentences/i)).toBeInTheDocument();
  });

  it('displays 0% when progress total is 0 (avoids division by zero)', () => {
    render(
      <TargetScorePanel
        {...makeProps({
          isLoading: true,
          progress: { current: 0, total: 0, phase: 'rewriting' },
        })}
      />,
    );
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('displays 100% when current equals total', () => {
    render(
      <TargetScorePanel
        {...makeProps({
          isLoading: true,
          progress: { current: 5, total: 5, phase: 'rewriting' },
        })}
      />,
    );
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('does NOT render progress when isLoading=false even with progress object', () => {
    render(
      <TargetScorePanel
        {...makeProps({
          isLoading: false,
          progress: { current: 3, total: 5, phase: 'rewriting' },
        })}
      />,
    );
    expect(screen.queryByTestId('bulk-progress-bar')).not.toBeInTheDocument();
  });
});

// ── Result messages ──────────────────────────────────────────────────────────

describe('TargetScorePanel – result messages', () => {
  it('renders bulk-result-message when result is provided and not loading', () => {
    render(
      <TargetScorePanel
        {...makeProps({
          isLoading: false,
          result: { achievedScore: 25, targetMet: true, targetScore: 30 },
        })}
      />,
    );
    expect(screen.getByTestId('bulk-result-message')).toBeInTheDocument();
  });

  it('shows success message when targetMet=true', () => {
    render(
      <TargetScorePanel
        {...makeProps({
          isLoading: false,
          result: { achievedScore: 22, targetMet: true, targetScore: 30 },
        })}
      />,
    );
    const msg = screen.getByTestId('bulk-result-message');
    expect(msg).toHaveTextContent(/score reduced to 22%/i);
  });

  it('shows failure message with achieved and target scores when targetMet=false', () => {
    render(
      <TargetScorePanel
        {...makeProps({
          isLoading: false,
          result: { achievedScore: 58, targetMet: false, targetScore: 30 },
        })}
      />,
    );
    const msg = screen.getByTestId('bulk-result-message');
    expect(msg).toHaveTextContent(/best achieved: 58%/i);
    expect(msg).toHaveTextContent(/target: 30%/i);
  });

  it('does NOT render result message when isLoading=true (even with result object)', () => {
    render(
      <TargetScorePanel
        {...makeProps({
          isLoading: true,
          result: { achievedScore: 25, targetMet: true, targetScore: 30 },
        })}
      />,
    );
    expect(screen.queryByTestId('bulk-result-message')).not.toBeInTheDocument();
  });

  it('rounds fractional achievedScore in success message', () => {
    render(
      <TargetScorePanel
        {...makeProps({
          isLoading: false,
          result: { achievedScore: 22.7, targetMet: true, targetScore: 30 },
        })}
      />,
    );
    expect(screen.getByTestId('bulk-result-message')).toHaveTextContent('23%');
  });

  it('rounds fractional achievedScore in failure message', () => {
    render(
      <TargetScorePanel
        {...makeProps({
          isLoading: false,
          result: { achievedScore: 58.4, targetMet: false, targetScore: 30 },
        })}
      />,
    );
    expect(screen.getByTestId('bulk-result-message')).toHaveTextContent('58%');
  });
});
