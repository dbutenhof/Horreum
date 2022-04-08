import { useMemo, useState, useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useHistory } from "react-router"

import { useTester } from "../../auth"
import { alertAction } from "../../alerts"
import * as api from "../alerting/api"
import { NavLink } from "react-router-dom"
import { ChangeDetection, ChangeDetectionModelConfig, Variable } from "../alerting/types"

import {
    Alert,
    AlertActionCloseButton,
    Bullseye,
    Button,
    EmptyState,
    Form,
    FormGroup,
    Modal,
    Popover,
    Select,
    SelectOption,
    SimpleList,
    SimpleListGroup,
    SimpleListItem,
    Spinner,
    Split,
    SplitItem,
    TextInput,
    Title,
} from "@patternfly/react-core"

import { PlusCircleIcon } from "@patternfly/react-icons"

import HelpButton from "../../components/HelpButton"
import Labels from "../../components/Labels"
import OptionalFunction from "../../components/OptionalFunction"
import RecalculateModal from "../alerting/RecalculateModal"
import TestSelect, { SelectedTest } from "../../components/TestSelect"
import DatasetLogModal from "./DatasetLogModal"
import { subscriptions as subscriptionsSelector } from "./selectors"
import { updateFingerprint } from "./actions"
import { TabFunctionsRef } from "../../components/SavedTabs"
import { Test } from "./reducers"
import VariableForm from "./VariableForm"

type TestSelectModalProps = {
    isOpen: boolean
    onClose(): void
    onConfirm(testId: number, group: string | undefined): Promise<any>
}

const CopyVarsModal = ({ isOpen, onClose, onConfirm }: TestSelectModalProps) => {
    const [test, setTest] = useState<SelectedTest>()
    const [working, setWorking] = useState(false)
    const [selectGroupOpen, setSelectGroupOpen] = useState(false)
    const [groups, setGroups] = useState<string[]>([])
    const [group, setGroup] = useState<string>()
    const reset = () => {
        setTest(undefined)
        setWorking(false)
        setGroups([])
        setGroup(undefined)
        onClose()
    }
    return (
        <Modal
            className="foobar"
            variant="small"
            title="Copy variables from..."
            isOpen={isOpen}
            onClose={reset}
            actions={[
                <Button
                    isDisabled={!test || working}
                    onClick={() => {
                        setWorking(true)
                        onConfirm(test?.id || -1, group === "<all groups>" ? undefined : group).finally(reset)
                    }}
                >
                    Copy
                </Button>,
                <Button isDisabled={working} variant="secondary" onClick={reset}>
                    Cancel
                </Button>,
            ]}
        >
            {working && <Spinner />}
            {!working && (
                <>
                    <TestSelect
                        selection={test}
                        onSelect={t => {
                            setTest(t)
                            setGroups([])
                            api.fetchVariables(t.id).then(response => setGroups(groupNames(response)))
                        }}
                        placeholderText="Select..."
                    />
                    {test && groups.length > 0 && (
                        <Select
                            isOpen={selectGroupOpen}
                            onToggle={setSelectGroupOpen}
                            selections={group}
                            onSelect={(_, item) => {
                                setGroup(item as string)
                                setSelectGroupOpen(false)
                            }}
                        >
                            {[
                                <SelectOption key={"all"} value="<all groups>" />,
                                ...groups.map(group => <SelectOption key={group} value={group} />),
                            ]}
                        </Select>
                    )}
                </>
            )}
        </Modal>
    )
}

type RenameGroupModalProps = {
    isOpen: boolean
    groups: string[]
    onRename(from: string, to: string): void
    onClose(): void
}

const RenameGroupModal = (props: RenameGroupModalProps) => {
    const [from, setFrom] = useState<string>()
    const [to, setTo] = useState<string>()
    const [selectOpen, setSelectOpen] = useState(false)
    return (
        <Modal
            variant="small"
            title="Rename group"
            isOpen={props.isOpen}
            onClose={props.onClose}
            actions={[
                <Button
                    isDisabled={!from || !to}
                    onClick={() => {
                        props.onRename(from as string, to as string)
                        props.onClose()
                    }}
                >
                    Rename
                </Button>,
                <Button
                    variant="secondary"
                    onClick={() => {
                        props.onClose()
                    }}
                >
                    Cancel
                </Button>,
            ]}
        >
            <Form>
                <FormGroup label="Existing group" fieldId="from">
                    <Select
                        placeholderText="Select group..."
                        isOpen={selectOpen}
                        onToggle={setSelectOpen}
                        selections={from}
                        onSelect={(_, item) => {
                            setFrom(item as string)
                            setSelectOpen(false)
                        }}
                    >
                        {props.groups.map(group => (
                            <SelectOption key={group} value={group} />
                        ))}
                    </Select>
                </FormGroup>
                <FormGroup label="New group name" fieldId="to">
                    <TextInput value={to} id="to" onChange={setTo} />
                </FormGroup>
            </Form>
        </Modal>
    )
}

type ChangeDetectionFormProps = {
    test: Test | undefined
    funcsRef: TabFunctionsRef
    onModified(modified: boolean): void
}

type ActionsProps = {
    isTester: boolean
    testName: string
    canRename: boolean
    onCopy(): void
    onRenameGroup(): void
    onRecalculate(): void
    onShowLog(): void
}

const Actions = (props: ActionsProps) => {
    return (
        <div>
            <NavLink className="pf-c-button pf-m-primary" to={"/changes?test=" + props.testName}>
                Go to changes
            </NavLink>
            {props.isTester && (
                <>
                    <Button variant="secondary" onClick={props.onCopy}>
                        Copy...
                    </Button>
                    <Button variant="secondary" onClick={props.onRenameGroup} isDisabled={props.canRename}>
                        Rename group...
                    </Button>
                    <Button variant="secondary" onClick={props.onRecalculate}>
                        Recalculate
                    </Button>
                    <Button variant="secondary" onClick={props.onShowLog}>
                        Show log
                    </Button>
                </>
            )}
        </div>
    )
}

function groupNames(vars: Variable[]) {
    return [
        ...new Set<string>(
            vars
                .map(v => v.group)
                .filter(g => !!g)
                .map(g => g as string)
        ),
    ].sort()
}

export default function ChangeDetectionForm({ test, onModified, funcsRef }: ChangeDetectionFormProps) {
    const [labels, setLabels] = useState<string[]>([])
    const [filter, setFilter] = useState<string>()
    const [variables, setVariables] = useState<Variable[]>([])
    const [groups, setGroups] = useState<string[]>([])
    const [selectedVariable, setSelectedVariable] = useState<Variable>()
    const [recalcConfirm, setRecalcConfirm] = useState<(_: any) => void>()
    const [ignoreNoSubscriptions, setIgnoreNoSubscriptions] = useState(false)
    const [defaultChangeDetectionConfigs, setDefaultChangeDetectionConfigs] = useState<ChangeDetection[]>([])
    const [changeDetectionModels, setChangeDetectionModels] = useState<ChangeDetectionModelConfig[]>([])
    const dispatch = useDispatch()
    // dummy variable to cause reloading of variables
    const [reload, setReload] = useState(0)
    useEffect(() => {
        if (!test?.id) {
            return
        }
        setLabels(test.fingerprintLabels || [])
        setFilter(test.fingerprintFilter || undefined)
        api.fetchVariables(test.id).then(
            response => {
                response.forEach((v: Variable) => {
                    // convert nulls to undefined
                    if (!v.group) v.group = undefined
                })
                setVariables(response)
                if (response.length > 0) {
                    setSelectedVariable(response[0])
                }
                setGroups(groupNames(response))
            },
            error => dispatch(alertAction("VARIABLE_FETCH", "Failed to fetch change detection variables", error))
        )
    }, [test, reload, dispatch])
    useEffect(() => {
        api.models().then(setChangeDetectionModels, error =>
            dispatch(alertAction("FETCH_MODELS", "Failed to fetch available change detection models.", error))
        )
        api.defaultChangeDetectionConfigs().then(setDefaultChangeDetectionConfigs, error =>
            dispatch(alertAction("FETCH_MODELS", "Failed to fetch available change detection models.", error))
        )
    }, [])
    const isTester = useTester(test?.owner || "__no_owner__")
    funcsRef.current = {
        save: () => {
            variables.forEach(v => {
                if (v.calculation === "") {
                    v.calculation = null
                }
            })
            if (!test) {
                return Promise.reject("No test!")
            }
            return Promise.all([
                dispatch(updateFingerprint(test?.id || -1, labels, filter || null)),
                api
                    .updateVariables(test.id, variables)
                    .catch(error => {
                        dispatch(alertAction("VARIABLE_UPDATE", "Failed to update change detection variables", error))
                        return Promise.reject()
                    })
                    .then(_ => {
                        return new Promise(resolve => {
                            // we have to pass this using function, otherwise it would call the resolve function
                            setRecalcConfirm(() => resolve)
                        })
                    })
                    .then(_ => {
                        Promise.resolve()
                    }),
            ])
        },
        reset: () => {
            setVariables([])
            setReload(reload + 1)
        },
    }

    const [recalculateOpen, setRecalculateOpen] = useState(false)
    const [copyOpen, setCopyOpen] = useState(false)
    const addVariable = () => {
        const newVar = {
            id: Math.min(-1, ...variables.map(v => v.id - 1)),
            testid: test?.id || -1,
            name: "",
            order: variables.length,
            labels: [],
            calculation: null,
            changeDetection: JSON.parse(JSON.stringify(defaultChangeDetectionConfigs)) as ChangeDetection[],
        }
        setVariables([...variables, newVar])
        setSelectedVariable(newVar)
        onModified(true)
    }

    const [renameGroupOpen, setRenameGroupOpen] = useState(false)
    const [isLogOpen, setLogOpen] = useState(false)
    const subscriptions = useSelector(subscriptionsSelector(test?.id || -1))?.filter(s => !s.startsWith("!"))

    const history = useHistory()
    useEffect(() => {
        const fragmentParts = history.location.hash.split("+")
        if (fragmentParts.length === 2 && fragmentParts[0] === "#vars") {
            const component = document.getElementById("variable-" + fragmentParts[1])
            if (component) {
                component.scrollIntoView()
            }
        }
    }, [])

    const groupedVariables = useMemo(() => {
        const grouped = variables
            .reduce((a: Variable[][], v: Variable) => {
                const group = a.find(g => g[0].group === v.group)
                if (group === undefined) {
                    a.push([v])
                } else {
                    group.push(v)
                }
                return a
            }, [])
            .sort((g1, g2) => (g1[0].group || "").localeCompare(g2[0].group || ""))
        grouped.forEach(g => g.sort((v1, v2) => v1.name.localeCompare(v2.name)))
        return grouped
    }, [variables])

    if (!variables || !test) {
        return (
            <Bullseye>
                <Spinner />
            </Bullseye>
        )
    }
    return (
        <>
            <Form isHorizontal>
                <FormGroup
                    fieldId="fingerprintLabels"
                    label="Fingerprint labels"
                    labelIcon={
                        <Popover
                            headerContent="Labels used to extract fingerprint"
                            bodyContent={
                                <div>
                                    Set of labels that identifies a unique configuration of the test. Datasets will be
                                    categorized according to the values in this fingerprint and each combination will
                                    produce its own series of results that are subject to change detection.
                                </div>
                            }
                        >
                            <HelpButton />
                        </Popover>
                    }
                >
                    <Labels
                        labels={labels}
                        onChange={labels => {
                            setLabels(labels)
                            onModified(true)
                        }}
                        isReadOnly={!isTester}
                        defaultMetrics={false}
                        defaultFiltering={true}
                    />
                </FormGroup>
                <FormGroup
                    fieldId="fingerprintFilter"
                    label="Fingerprint filter"
                    labelIcon={
                        <Popover
                            headerContent="Labels used to extract fingerprint"
                            bodyContent={
                                <div>
                                    This function will receive the label value or object with properties matching labels
                                    as its sole argument. If the result of this function is truthy the dataset will be
                                    subject to change detection; otherwise it will be ignored.
                                    <br />
                                    If this function is not defined all fingerprints are allowed to run change
                                    detection.
                                </div>
                            }
                        >
                            <HelpButton />
                        </Popover>
                    }
                >
                    <OptionalFunction
                        func={filter}
                        onChange={func => {
                            setFilter(func)
                            onModified(true)
                        }}
                        readOnly={!isTester}
                        defaultFunc={"value => value"}
                        undefinedText="No fingerprint filter"
                        addText="Add fingerprint filter"
                    />
                </FormGroup>
            </Form>
            <div
                style={{
                    marginTop: "16px",
                    marginBottom: "16px",
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                }}
            >
                <Title headingLevel="h3">Variables</Title>
                <Actions
                    isTester={isTester}
                    testName={test.name}
                    canRename={!groups || groups.length === 0}
                    onCopy={() => setCopyOpen(true)}
                    onRenameGroup={() => setRenameGroupOpen(true)}
                    onRecalculate={() => setRecalculateOpen(true)}
                    onShowLog={() => setLogOpen(true)}
                />
            </div>
            {isTester &&
                subscriptions !== undefined &&
                subscriptions.length == 0 &&
                !ignoreNoSubscriptions &&
                variables.length > 0 && (
                    <Alert
                        variant="warning"
                        title="This test has no subscriptions"
                        actionClose={<AlertActionCloseButton onClose={() => setIgnoreNoSubscriptions(true)} />}
                    >
                        This test is configured to run change detection but nobody is listening to change notifications.
                        Please configure interested parties in the Subscriptions tab.
                    </Alert>
                )}
            <RenameGroupModal
                isOpen={renameGroupOpen}
                groups={groups}
                onClose={() => setRenameGroupOpen(false)}
                onRename={(from, to) => {
                    variables.forEach(v => {
                        if (v.group === from) {
                            v.group = to
                        }
                    })
                    setVariables([...variables])
                    setGroups([...groups.map(g => (g === from ? to : g))])
                }}
            />
            <RecalculateModal
                isOpen={!!recalcConfirm}
                onClose={() => {
                    if (recalcConfirm) {
                        recalcConfirm(false)
                    }
                    setRecalcConfirm(undefined)
                }}
                showLog={() => setLogOpen(true)}
                testId={test.id}
                title="Proceed with recalculation"
                recalculate="Recalculate"
                cancel="Skip"
                message="Do you want to drop all datapoints and calculate new ones, based on the updated variables?"
            />
            <RecalculateModal
                isOpen={recalculateOpen}
                onClose={() => setRecalculateOpen(false)}
                showLog={() => setLogOpen(true)}
                testId={test.id}
                title="Confirm recalculation"
                recalculate="Recalculate"
                cancel="Cancel"
                message="Really drop all datapoints, calculating new ones?"
            />
            <CopyVarsModal
                isOpen={copyOpen}
                onClose={() => setCopyOpen(false)}
                onConfirm={(otherTestId, group) => {
                    return api.fetchVariables(otherTestId).then(
                        response => {
                            const copied = group ? response.filter((v: Variable) => v.group === group) : response
                            setVariables([
                                ...variables,
                                ...copied.map((v: Variable) => ({
                                    ...v,
                                    id: -1,
                                    testid: test.id,
                                })),
                            ])
                        },
                        error =>
                            dispatch(alertAction("VARIABLE_FETCH", "Failed to fetch change detection variables", error))
                    )
                }}
            />
            <DatasetLogModal isOpen={isLogOpen} onClose={() => setLogOpen(false)} testId={test.id} source="variables" />
            <Split hasGutter>
                <SplitItem style={{ minWidth: "20vw", maxWidth: "20vw", overflow: "clip" }}>
                    {groupedVariables && groupedVariables.length > 0 && (
                        <SimpleList
                            onSelect={(_, props) => setSelectedVariable(variables.find(v => v.id === props.itemId))}
                            isControlled={false}
                        >
                            {groupedVariables.map((g, j) => (
                                <SimpleListGroup key={j} title={g[0].group || "(no group)"}>
                                    {g.map((v, i) => (
                                        <SimpleListItem key={i} itemId={v.id} isActive={selectedVariable?.id === v.id}>
                                            {v.name || (
                                                <span style={{ color: "#888" }}>(please set variable name)</span>
                                            )}
                                        </SimpleListItem>
                                    ))}
                                </SimpleListGroup>
                            ))}
                        </SimpleList>
                    )}
                    {isTester && (
                        <Button variant="link" onClick={addVariable}>
                            <PlusCircleIcon />
                            {"\u00A0"}Add new variable...
                        </Button>
                    )}
                </SplitItem>
                <SplitItem isFilled>
                    {!selectedVariable && (
                        <Bullseye>
                            <EmptyState>No variables</EmptyState>
                        </Bullseye>
                    )}
                    {selectedVariable && (
                        <>
                            {isTester && (
                                <div style={{ textAlign: "right" }}>
                                    <Button
                                        variant="danger"
                                        onClick={() => {
                                            const newVars = variables.filter(v => v !== selectedVariable)
                                            setVariables(newVars)
                                            setSelectedVariable(newVars.length > 0 ? newVars[0] : undefined)
                                        }}
                                    >
                                        Delete variable
                                    </Button>
                                </div>
                            )}
                            <VariableForm
                                variable={selectedVariable}
                                isTester={isTester}
                                onChange={value => {
                                    setSelectedVariable(value)
                                    const newVars = variables.filter(v => v.id !== value.id)
                                    newVars.push(value)
                                    setVariables(newVars)
                                    onModified(true)
                                }}
                                groups={groups}
                                setGroups={setGroups}
                                models={changeDetectionModels}
                            />
                        </>
                    )}
                </SplitItem>
            </Split>
        </>
    )
}
