import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SitePanel } from './site-panel';

describe('SitePanel', () => {
  let component: SitePanel;
  let fixture: ComponentFixture<SitePanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SitePanel],
    }).compileComponents();

    fixture = TestBed.createComponent(SitePanel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders nothing while no site is selected', () => {
    expect(fixture.nativeElement.querySelector('.panel')).toBeNull();
  });
});
