import { Card, CardBody, Divider, Image, Input, Modal, ModalContent, useDisclosure } from '@heroui/react';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { LuSearch } from 'react-icons/lu';
import { debounce, normalizeUrl } from '@renderer/lib/utils';
import { SearchOption } from '@renderer/lib/search';

export function NewTabModalContent({
  onNewTab,
  isOpen,
  onOpenChange
} : {
  onNewTab: (url: string) => void;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const [input, setInput] = useState('');
  const [options, _setOptions] = useState<SearchOption[]>([]);
  const [selectOptionIndex, setSelectOptionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [shouldShowOptions, setShouldShowOptions] = useState<boolean>(false);

  function setOptions(options: SearchOption[]) {
    if (options.length === 0) {
      setShouldShowOptions(false);
      setTimeout(() => {
        _setOptions(options);
      }, 300);
    } else {
      setShouldShowOptions(true);
      _setOptions(options);
    }
  }

  function handleKeyDown(e: KeyboardEvent, onClose: () => void) {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setSelectOptionIndex(Math.max(0, selectOptionIndex-1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectOptionIndex(Math.min(options.length-1, selectOptionIndex+1));
        break;
      case 'Enter':
        e.preventDefault();
        if (options[selectOptionIndex]) {
          onNewTab(options[selectOptionIndex].url);
          handleClose(onClose);
        }
        break;
      case 'Escape':
        e.preventDefault();
        handleClose(onClose);
        break;
    }
  }

  function handleClose(onClose: () => void) {
    setInput("");
    setSelectOptionIndex(-1);
    setOptions([]);
    onClose();
  }

  const debouncedSearch = useMemo(
    () => debounce((input: string) => {
      const url = normalizeUrl(input);
      const newOptions: SearchOption[] = [];
      if (url.includes("https://www.google.com/search?q=")) {
        newOptions.push({
          title: 'Search with Google',
          description: input,
          url,
        });
      } else {
        newOptions.push({
          title: url,
          url: url
        });
        const encode = encodeURIComponent(input);
        newOptions.push({
          title: 'Search with Google',
          description: input,
          url: `https://www.google.com/search?q=${encode}`
        });
      }
      setOptions(newOptions);
    }, 100),
    []
  );

  useEffect(() => {
    if (input.trim()) {
      debouncedSearch(input);
    } else {
      setOptions([]);
    }
  }, [input]);

  useEffect(() => {
    // 当出现 option 时，选中第一个
    // 当没有 option 时，取消选中
    // 当 option 数量不够时，选中最后一个
    if (selectOptionIndex === -1) {
      if (options.length > 0) {
        setSelectOptionIndex(0);
      }
    } else {
      if (options.length === 0) {
        setSelectOptionIndex(-1);
      } else {
        if (selectOptionIndex >= options.length) {
          setSelectOptionIndex(options.length - 1);
        }
      }
    }
  }, [options]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="center"
      hideCloseButton
      className="translate-y-[-10vh]"
    >
      <ModalContent>
        {(onClose) => (
          <div className="flex flex-col justify-center items-center">
            <Input
              ref={inputRef}
              size="lg"
              onValueChange={setInput}
              value={input}
              placeholder="Search..."
              startContent={<LuSearch className="mr-1"/>}
              onKeyDown={(e) => handleKeyDown(e, onClose)}
              classNames={{
                innerWrapper: "bg-transparent",
                inputWrapper: "bg-transparent hover:bg-transparent data-[hover=true]:bg-transparent data-[focus=true]:bg-transparent shadow-none",
                input: "bg-transparent"
              }}
            />

            <div className={`
              w-full h-auto transition-all ease-in-out duration-300 overflow-hidden
              ${shouldShowOptions ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
            `}>
              <Divider/>

              <div className="flex flex-col gap-1 w-full p-2">
                {
                  options.map((option, index) => (
                    <Card
                      className="w-full select-none"
                      key={index}
                      classNames={{
                        base: `shadow-none`
                      }}
                    >
                      <CardBody className={`${selectOptionIndex === index ? 'bg-default-200' : ''}`}>
                        <Image
                          alt=""
                          src={option.icon}
                        />
                        <div className="flex flex-col">
                          <p className="text-md">{option.title}</p>
                          <p className="text-small text-default-500">{option.description}</p>
                        </div>
                      </CardBody>
                    </Card>
                  ))
                }
              </div>
            </div>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}

export default function useNewTabModal(onNewTab: (url: string) => void): [() => void, ReactNode] {
  const {isOpen, onOpen, onOpenChange} = useDisclosure();

  return [
    onOpen,
    <NewTabModalContent
      onNewTab={onNewTab}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    />
  ]
}
