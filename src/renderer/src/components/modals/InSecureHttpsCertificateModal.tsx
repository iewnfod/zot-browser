import {
  Button,
  Divider,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure
} from '@heroui/react';
import { useEffect, useState } from 'react';

function RowContent({
  title,
  content
} : {
  title: string,
  content: string
}) {
  return (
    <div className="flex flex-col gap-0 text-sm w-full">
      <p className="text-neutral-500">{title}:</p>
      <p className="overflow-hidden whitespace-nowrap text-ellipsis">{content}</p>
    </div>
  );
}

export default function InSecureHttpsCertificateModal() {
  const {isOpen, onOpen, onClose, onOpenChange} = useDisclosure();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [issuerName, setIssuerName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [fingerPrint, setFingerPrint] = useState('');

  function handleOpen(_event, data) {
    console.log('insecure https certificate data: ', data);
    setUrl(data.url);
    setError(data.error);
    setSubjectName(data.subjectName);
    setIssuerName(data.issuerName);
    setExpiry(data.expiry);
    setFingerPrint(data.fingerPrint);
    onOpen();
  }

  function handleReturn() {
    window.electron.ipcRenderer.send('insecure-https-certificate-modal-response', 1);
    onClose();
  }

  function handleContinue() {
    window.electron.ipcRenderer.send('insecure-https-certificate-modal-response', 0);
    onClose();
  }

  useEffect(() => {
    window.electron.ipcRenderer.on('open-insecure-https-certificate-modal', handleOpen);
    console.log('open-insecure-https-certificate-modal registered');

    return () => {
      window.electron.ipcRenderer.removeAllListeners('open-insecure-https-certificate-modal');
      console.log('open-insecure-https-certificate-modal unregistered');
    };
  }, []);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={false}
      hideCloseButton
      isKeyboardDismissDisabled
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="select-none">
              Insecure HTTPS Certificate
            </ModalHeader>
            <ModalBody>
              <div className="flex flex-col gap-3 w-full">
                <div className="flex flex-col gap-1 w-full">
                  <RowContent title={"URL"} content={url}/>
                  <RowContent title={"Error"} content={error}/>
                </div>

                <Divider className="rounded-medium"/>

                <div className="flex flex-col gap-1">
                  <RowContent title={"Subject Name"} content={subjectName}/>
                  <RowContent title={"Issuer Name"} content={issuerName}/>
                  <RowContent title={"Expiry"} content={expiry}/>
                  <RowContent title={"Finger Print"} content={fingerPrint}/>
                </div>

                <Divider className="rounded-medium"/>

                <div>
                  <p className="w-full overflow-hidden whitespace-normal">If you trust this site, choose continue to access, otherwise, please go back.</p>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={handleContinue}>
                Continue to Access (Trust and Remember)
              </Button>
              <Button color="primary" onPress={handleReturn}>
                Return
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
