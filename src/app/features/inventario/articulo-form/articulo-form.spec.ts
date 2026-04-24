import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArticuloForm } from './articulo-form';

describe('ArticuloForm', () => {
  let component: ArticuloForm;
  let fixture: ComponentFixture<ArticuloForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArticuloForm],
    }).compileComponents();

    fixture = TestBed.createComponent(ArticuloForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
