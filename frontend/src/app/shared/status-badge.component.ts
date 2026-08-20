import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: '<span class="status" [class]="status">{{ label }}</span>',
})
export class StatusBadgeComponent {
  @Input({ required: true }) label = '';
  @Input() status = '';
}
