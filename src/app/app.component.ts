import { Component, OnDestroy } from '@angular/core';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { map, Observable, startWith, Subject, takeUntil, tap, withLatestFrom } from 'rxjs';

interface ApiCall {
    blocking: boolean;
    halting: boolean;
    time: number;
    payload: string;
    cachable: boolean;
}

enum Loader {
    SPINNER = "Spinner",
    DELAY_SPINNER = "Delay Spinner",
    PROGRESSIVE = "Progress Bar",
    DELAY_PROGRESSIVE = "Delay Progress Bar",
}

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnDestroy {
    readonly form: FormGroup;
    readonly calls: FormArray;

    readonly orderedApiCalls$: Observable<ApiCall[][]>;

    readonly runSimulation$ = new Subject<boolean>();
    readonly unsubscribe$ = new Subject<void>();
    
    timeoutRefs: number[] = [];
    payloads: { payload: string, time: number}[] = [];
    loading = 0;
    forceLoader = false;
    loader: Loader = Loader.SPINNER;
    loaders = [Loader.SPINNER, Loader.DELAY_SPINNER, Loader.PROGRESSIVE, Loader.DELAY_PROGRESSIVE];

    readonly Loader = Loader;

    constructor() {
        this.calls = new FormArray([
            this.getApiFormGroup(),
        ]);

        this.form = new FormGroup({
            calls: this.calls,
        });

        this.orderedApiCalls$ = this.calls.valueChanges.pipe(
            startWith(this.calls.value),
            map(callValues => {
                const orderedApiCalls: ApiCall[][] = [];
                orderedApiCalls.push([]);

                for(const callValue of callValues) {
                    if (callValue.halting) {
                        orderedApiCalls.push([]);
                    }

                    orderedApiCalls[orderedApiCalls.length - 1].push(callValue);

                    if (callValue.blocking || callValue.halting) {
                        orderedApiCalls.push([]);
                    }
                }

                return orderedApiCalls;
            }),
            map(orderedCallValues => orderedCallValues.filter(nestedCallValues => nestedCallValues.length))
        );

        this.runSimulation$.pipe(
            tap(() => {
                this.payloads = [];
                this.clearTimeoutRefs();
            }),
            withLatestFrom(this.orderedApiCalls$),
            tap(([cache, orderedApiCalls]) => {
                this.simulateApiCalls([...orderedApiCalls], cache);
            }),
            takeUntil(this.unsubscribe$),
        
        ).subscribe();
    }

    getApiFormGroup(blocking = false, time = 200, payload?: string): FormGroup {
        return new FormGroup({
            blocking: new FormControl(blocking),
            time: new FormControl(time),
            payload: new FormControl(payload ?? 'payload-' + ((this.calls?.length || 0) + 1)),
            edit: new FormControl(false),
            halting: new FormControl(false),
            cachable: new FormControl(false),
        });
    }

    removeApiFormGroup(index: number): void {
        this.calls.removeAt(index);
    }

    pushApiFormGroup(blocking = false, time = 200, payload?: string): void {
        this.calls.push(this.getApiFormGroup(blocking, time, payload));
    }

    toggleEditMode(apiFormGroup: FormGroup): void {
        const editFormControl = apiFormGroup.controls['edit'] as FormControl;
        const editIsOn = editFormControl.value;
        editFormControl.setValue(!editIsOn);
    }

    clearTimeoutRefs(): void {
        const timeoutRefs = this.timeoutRefs;

        this.timeoutRefs = [];

        for (const timeoutRef of timeoutRefs) {
            window.clearTimeout(timeoutRef);
        }
    }

    runSimulation(cache: boolean): void {
        this.runSimulation$.next(cache);
    }

    simulateApiCalls(orderedApiCalls: ApiCall[][], cache: boolean, maxTime = 0): void {
        if (!orderedApiCalls.length) {
            return;
        }

        const nestedApiCalls = orderedApiCalls.shift()!;

        for (const call of nestedApiCalls) {
            if (!call.halting && (!cache || !call.cachable)) {
                this.loading += 1;
                const time = maxTime + call.time;
                this.timeoutRefs.push(window.setTimeout(() => {
                    this.payloads.push({ payload: call.payload, time });
                    this.timeoutRefs.push(window.setTimeout(() => {
                        this.loading -= 1;
                    }, 0));

                }, time));
            }
        }

        maxTime += Math.max(...nestedApiCalls.map(call => call.time));

        this.timeoutRefs.push(window.setTimeout(() => {
            this.simulateApiCalls(orderedApiCalls, cache, maxTime);
        }, maxTime));
    }

    setLoader(loader: Loader): void {
        this.loader = loader;
    }

    ngOnDestroy(): void {
        this.unsubscribe$.next();
        this.unsubscribe$.complete();
    }
}
