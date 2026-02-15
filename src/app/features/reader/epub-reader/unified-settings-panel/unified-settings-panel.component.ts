import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  ThemeOption, 
  FlowMode,
  SpreadMode,
  ZoomLevel,
  PageLayout,
  TocItem, 
  Bookmark, 
  ReadingGoal, 
  ReadingStats,
  CustomColorPalette,
  READER_FONTS, 
  FONT_SIZE_MIN, 
  FONT_SIZE_STEP, 
  LINE_HEIGHT_MIN, 
  LINE_HEIGHT_STEP,
  FOLLOW_MODE_SPEED_MIN,
  FOLLOW_MODE_SPEED_MAX,
  FOLLOW_MODE_SPEED_STEP,
  LETTER_SPACING_MIN,
  LETTER_SPACING_MAX,
  LETTER_SPACING_STEP,
  PRESET_COLOR_PALETTES,
} from '../../../../core/models/document.model';

export interface SettingsState {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  theme: ThemeOption;
  flowMode: FlowMode;
  spreadMode: SpreadMode;
  focusMode: boolean;
  followMode: boolean;
  followModeSpeed: number;
  zoomLevel: ZoomLevel;
  pageLayout: PageLayout;
  letterSpacing: number;
  wordHighlighting: boolean;
  bionicReading: boolean;
  customColorPalette: CustomColorPalette | null;
}

export type TabType = 'settings' | 'chapters' | 'bookmarks' | 'accessibility';

@Component({
  selector: 'app-unified-settings-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './unified-settings-panel.component.html',
  styleUrl: './unified-settings-panel.component.css'
})
export class UnifiedSettingsPanelComponent {
  @Input() isOpen = false;
  @Input() theme: ThemeOption = 'light';
  @Input() isPdf = false;
  
  // Settings tab inputs
  @Input() settings!: SettingsState;
  
  // Chapters tab inputs
  @Input() chapters: TocItem[] = [];
  @Input() currentChapter: string | null = null;
  
  // Bookmarks tab inputs
  @Input() bookmarks: Bookmark[] = [];
  @Input() readingStats: ReadingStats | null = null;
  @Input() readingGoal: ReadingGoal | null = null;
  @Input() todayReadingTime: number | null = null;
  @Input() progressPercent: number | null = null;

  // Outputs
  @Output() close = new EventEmitter<void>();
  @Output() settingsChange = new EventEmitter<SettingsState>();
  @Output() chapterSelect = new EventEmitter<TocItem>();
  @Output() bookmarkJump = new EventEmitter<Bookmark>();
  @Output() bookmarkRemove = new EventEmitter<string>();

  // Tab state
  activeTab = signal<TabType>('settings');

  // Zoom dropdown state
  zoomDropdownOpen = signal<boolean>(false);

  // --- Control constraints ---
  readonly FONT_SIZE_MIN = FONT_SIZE_MIN;
  readonly FONT_SIZE_STEP = FONT_SIZE_STEP;
  readonly LINE_HEIGHT_MIN = LINE_HEIGHT_MIN;
  readonly LINE_HEIGHT_STEP = LINE_HEIGHT_STEP;
  readonly FOLLOW_MODE_SPEED_MIN = FOLLOW_MODE_SPEED_MIN;
  readonly FOLLOW_MODE_SPEED_MAX = FOLLOW_MODE_SPEED_MAX;
  readonly FOLLOW_MODE_SPEED_STEP = FOLLOW_MODE_SPEED_STEP;
  readonly LETTER_SPACING_MIN = LETTER_SPACING_MIN;
  readonly LETTER_SPACING_MAX = LETTER_SPACING_MAX;
  readonly LETTER_SPACING_STEP = LETTER_SPACING_STEP;

  /** Available font families */
  readonly fonts = READER_FONTS;

  /** Preset color palettes */
  readonly presetPalettes = PRESET_COLOR_PALETTES;

  /** Predefined theme options */
  readonly themeOptions: { label: string; value: ThemeOption }[] = [
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
    { label: 'Sepia', value: 'sepia' },
    { label: 'HC Light', value: 'high-contrast-light' },
    { label: 'HC Dark', value: 'high-contrast-dark' },
  ];

  /** Zoom level options */
  readonly zoomOptions: { label: string; value: ZoomLevel }[] = [
    { label: 'Fit to width', value: 'fit-width' },
    { label: 'Fit to screen', value: 'fit-screen' },
    { label: '100%', value: '100' },
    { label: '200%', value: '200' },
    { label: '300%', value: '300' },
  ];

  /** Page layout options */
  readonly pageLayoutOptions: { label: string; value: PageLayout; icon: string }[] = [
    { label: 'Automatic', value: 'automatic', icon: 'auto' },
    { label: 'Two Page', value: 'two-page', icon: 'two-page' },
    { label: 'One Page', value: 'one-page', icon: 'one-page' },
  ];

  // --- Dragging state (desktop only) ---
  isDragging = false;
  panelX = signal<number | null>(null);
  panelY = signal<number | null>(null);
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private boundOnDragMove = this.onDragMove.bind(this);
  private boundOnDragEnd = this.onDragEnd.bind(this);

  // --- Custom color palette state ---
  showCustomPaletteEditor = signal<boolean>(false);
  customBg = signal<string>('#ffffff');
  customText = signal<string>('#000000');
  customLink = signal<string>('#007bff');

  ngOnDestroy(): void {
    // Clean up any lingering drag listeners
    document.removeEventListener('mousemove', this.boundOnDragMove);
    document.removeEventListener('mouseup', this.boundOnDragEnd);
    document.removeEventListener('touchmove', this.boundOnDragMove);
    document.removeEventListener('touchend', this.boundOnDragEnd);
  }

  /** Label for the panel header based on active tab */
  get panelTitle(): string {
    switch (this.activeTab()) {
      case 'settings': return 'Display options';
      case 'chapters': return 'Table of contents';
      case 'bookmarks': return 'Bookmarks';
      case 'accessibility': return 'Accessibility';
      default: return 'Display options';
    }
  }

  // ---------------------------------------------------------------------------
  // Tab management
  // ---------------------------------------------------------------------------

  switchTab(tab: TabType): void {
    this.activeTab.set(tab);
  }

  toggleZoomDropdown(): void {
    this.zoomDropdownOpen.update(v => !v);
  }

  selectZoomLevel(value: ZoomLevel): void {
    this.zoomDropdownOpen.set(false);
    this.updateZoomLevel(value);
  }

  // ---------------------------------------------------------------------------
  // Dragging logic
  // ---------------------------------------------------------------------------

  onDragStart(event: MouseEvent | TouchEvent): void {
    // Disable dragging on mobile (small screens)
    if (window.innerWidth <= 768) {
      return;
    }

    const panel = (event.target as HTMLElement).closest('.unified-panel') as HTMLElement | null;
    if (!panel) return;

    this.isDragging = true;
    const rect = panel.getBoundingClientRect();
    if (event instanceof MouseEvent) {
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;
    } else {
      const touch = event.touches[0];
      this.dragOffsetX = touch.clientX - rect.left;
      this.dragOffsetY = touch.clientY - rect.top;
    }

    document.addEventListener('mousemove', this.boundOnDragMove);
    document.addEventListener('mouseup', this.boundOnDragEnd);
    document.addEventListener('touchmove', this.boundOnDragMove, { passive: false });
    document.addEventListener('touchend', this.boundOnDragEnd);
    event.preventDefault();
  }

  private onDragMove(event: MouseEvent | TouchEvent): void {
    if (!this.isDragging) return;
    let clientX: number, clientY: number;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
      event.preventDefault();
    }
    this.panelX.set(clientX - this.dragOffsetX);
    this.panelY.set(clientY - this.dragOffsetY);
  }

  private onDragEnd(): void {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.boundOnDragMove);
    document.removeEventListener('mouseup', this.boundOnDragEnd);
    document.removeEventListener('touchmove', this.boundOnDragMove);
    document.removeEventListener('touchend', this.boundOnDragEnd);
  }

  // ---------------------------------------------------------------------------
  // Settings controls
  // ---------------------------------------------------------------------------

  /** Toggle between dark and light theme */
  toggleDarkTheme(): void {
    const newTheme = this.settings.theme === 'dark' ? 'light' : 'dark';
    this.emitSettings({ ...this.settings, theme: newTheme });
  }

  /** Whether dark theme is currently active */
  get isDarkTheme(): boolean {
    return this.settings.theme === 'dark';
  }

  increaseFontSize(): void {
    const newSize = this.settings.fontSize + FONT_SIZE_STEP;
    this.emitSettings({ ...this.settings, fontSize: newSize });
  }

  decreaseFontSize(): void {
    if (this.settings.fontSize > FONT_SIZE_MIN) {
      const newSize = this.settings.fontSize - FONT_SIZE_STEP;
      this.emitSettings({ ...this.settings, fontSize: newSize });
    }
  }

  increaseLineHeight(): void {
    const newHeight = Math.round((this.settings.lineHeight + LINE_HEIGHT_STEP) * 10) / 10;
    this.emitSettings({ ...this.settings, lineHeight: newHeight });
  }

  decreaseLineHeight(): void {
    if (this.settings.lineHeight > LINE_HEIGHT_MIN) {
      const newHeight = Math.round((this.settings.lineHeight - LINE_HEIGHT_STEP) * 10) / 10;
      this.emitSettings({ ...this.settings, lineHeight: newHeight });
    }
  }

  updateFontFamily(font: string): void {
    this.emitSettings({ ...this.settings, fontFamily: font });
  }

  updateTheme(value: ThemeOption): void {
    this.emitSettings({ ...this.settings, theme: value });
  }

  updateFlowMode(value: FlowMode): void {
    this.emitSettings({ ...this.settings, flowMode: value });
  }

  updateSpreadMode(value: SpreadMode): void {
    this.emitSettings({ ...this.settings, spreadMode: value });
  }

  updateZoomLevel(value: ZoomLevel): void {
    this.emitSettings({ ...this.settings, zoomLevel: value });
  }

  updatePageLayout(value: PageLayout): void {
    this.emitSettings({ ...this.settings, pageLayout: value });
  }

  /** Label for the currently selected zoom level */
  get currentZoomLabel(): string {
    const opt = this.zoomOptions.find(o => o.value === this.settings.zoomLevel);
    return opt?.label ?? 'Fit to screen';
  }

  toggleFocusMode(): void {
    this.emitSettings({ ...this.settings, focusMode: !this.settings.focusMode });
  }

  exitFocusMode(): void {
    this.emitSettings({ ...this.settings, focusMode: false });
    this.closePanel();
  }

  toggleFollowMode(): void {
    this.emitSettings({ ...this.settings, followMode: !this.settings.followMode });
  }

  // ---------------------------------------------------------------------------
  // Accessibility controls
  // ---------------------------------------------------------------------------

  increaseLetterSpacing(): void {
    const newSpacing = Math.min(
      Math.round((this.settings.letterSpacing + LETTER_SPACING_STEP) * 100) / 100,
      LETTER_SPACING_MAX
    );
    this.emitSettings({ ...this.settings, letterSpacing: newSpacing });
  }

  decreaseLetterSpacing(): void {
    const newSpacing = Math.max(
      Math.round((this.settings.letterSpacing - LETTER_SPACING_STEP) * 100) / 100,
      LETTER_SPACING_MIN
    );
    this.emitSettings({ ...this.settings, letterSpacing: newSpacing });
  }

  toggleWordHighlighting(): void {
    this.emitSettings({ ...this.settings, wordHighlighting: !this.settings.wordHighlighting });
  }

  toggleBionicReading(): void {
    this.emitSettings({ ...this.settings, bionicReading: !this.settings.bionicReading });
  }

  selectPresetPalette(palette: CustomColorPalette): void {
    if (palette.name === 'Default') {
      this.emitSettings({ ...this.settings, customColorPalette: null });
    } else {
      this.emitSettings({ ...this.settings, customColorPalette: palette });
    }
  }

  toggleCustomPaletteEditor(): void {
    this.showCustomPaletteEditor.update(v => !v);
    if (this.settings.customColorPalette) {
      this.customBg.set(this.settings.customColorPalette.background);
      this.customText.set(this.settings.customColorPalette.text);
      this.customLink.set(this.settings.customColorPalette.link);
    }
  }

  applyCustomPalette(): void {
    const palette: CustomColorPalette = {
      name: 'Custom',
      background: this.customBg(),
      text: this.customText(),
      link: this.customLink(),
    };
    this.emitSettings({ ...this.settings, customColorPalette: palette });
    this.showCustomPaletteEditor.set(false);
  }

  clearCustomPalette(): void {
    this.emitSettings({ ...this.settings, customColorPalette: null });
  }

  onCustomColorInput(field: 'bg' | 'text' | 'link', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (field === 'bg') this.customBg.set(value);
    else if (field === 'text') this.customText.set(value);
    else this.customLink.set(value);
  }

  /** Check if a preset palette is currently active */
  isPaletteActive(palette: CustomColorPalette): boolean {
    if (!this.settings.customColorPalette) return palette.name === 'Default';
    return (
      this.settings.customColorPalette.background === palette.background &&
      this.settings.customColorPalette.text === palette.text
    );
  }

  increaseFollowSpeed(): void {
    const newSpeed = Math.min(
      this.settings.followModeSpeed + FOLLOW_MODE_SPEED_STEP,
      FOLLOW_MODE_SPEED_MAX
    );
    this.emitSettings({ ...this.settings, followModeSpeed: newSpeed });
  }

  decreaseFollowSpeed(): void {
    const newSpeed = Math.max(
      this.settings.followModeSpeed - FOLLOW_MODE_SPEED_STEP,
      FOLLOW_MODE_SPEED_MIN
    );
    this.emitSettings({ ...this.settings, followModeSpeed: newSpeed });
  }

  private emitSettings(newSettings: SettingsState): void {
    this.settingsChange.emit(newSettings);
  }

  // ---------------------------------------------------------------------------
  // Chapter controls
  // ---------------------------------------------------------------------------

  onChapterClick(chapter: TocItem): void {
    this.chapterSelect.emit(chapter);
  }

  // ---------------------------------------------------------------------------
  // Bookmark controls
  // ---------------------------------------------------------------------------

  onBookmarkClick(bookmark: Bookmark): void {
    this.bookmarkJump.emit(bookmark);
  }

  onBookmarkRemove(bookmarkId: string, event: Event): void {
    event.stopPropagation();
    this.bookmarkRemove.emit(bookmarkId);
  }

  // ---------------------------------------------------------------------------
  // Close panel
  // ---------------------------------------------------------------------------

  closePanel(): void {
    this.close.emit();
  }

  // ---------------------------------------------------------------------------
  // Utility functions
  // ---------------------------------------------------------------------------

  formatDuration(milliseconds: number): string {
    const totalMinutes = Math.floor(milliseconds / 60000);
    if (totalMinutes < 60) {
      return `${totalMinutes}m`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  }
}
