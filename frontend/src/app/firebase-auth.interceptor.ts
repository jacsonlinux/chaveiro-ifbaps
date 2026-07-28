import { HttpInterceptorFn } from '@angular/common/http';
import { from, switchMap } from 'rxjs';
import { firebaseAuth } from './firebase';

export const firebaseAuthInterceptor: HttpInterceptorFn = (request, next) =>
  from(firebaseAuth.currentUser?.getIdToken() ?? Promise.resolve(undefined)).pipe(
    switchMap((token) =>
      next(
        token
          ? request.clone({
              setHeaders: { Authorization: `Bearer ${token}` },
            })
          : request,
      ),
    ),
  );
